#include "ADS1256Driver.h"

#include "config.h"

#define ADS_CMD_RDATA 0x01
#define ADS_CMD_SDATAC 0x0F
#define ADS_CMD_RREG 0x10
#define ADS_CMD_WREG 0x50
#define ADS_CMD_SELFCAL 0xF0

#define ADS_REG_STATUS 0x00
#define ADS_REG_MUX 0x01
#define ADS_REG_ADCON 0x02
#define ADS_REG_DRATE 0x03

static const uint32_t ADS_SPI_HZ = 1000000;
static const uint8_t ADS_SPI_MODE = SPI_MODE1;
static const uint8_t ADS_DRATE_1000_SPS = 0xA1;

ADS1256Driver::ADS1256Driver()
    : _spi(VSPI),
      _isInitialized(false),
      _drdyTimeoutStreak(0),
      _lastInitFailReason(INIT_OK) {}

bool ADS1256Driver::isAvailable() const {
  return _isInitialized;
}

ADS1256Driver::InitFailReason ADS1256Driver::getLastInitFailReason() const {
  return _lastInitFailReason;
}

const char* ADS1256Driver::getLastInitFailReasonStr() const {
  switch (_lastInitFailReason) {
    case INIT_OK:
      return "ok";
    case FAIL_DRDY_BEFORE_INIT:
      return "DRDY timeout before init";
    case FAIL_DRDY_SELFCAL:
      return "DRDY timeout during SELFCAL";
    case FAIL_REGS_ALL_FF:
      return "invalid register readback";
    case FAIL_DRATE_MISMATCH:
      return "DRATE readback mismatch";
    default:
      return "unknown";
  }
}

void ADS1256Driver::chipSelect(bool enabled) {
  digitalWrite(PIN_ADS_CS, enabled ? LOW : HIGH);
}

void ADS1256Driver::sendCommand(uint8_t command) {
  chipSelect(true);
  _spi.transfer(command);
  chipSelect(false);
  delayMicroseconds(5);
}

bool ADS1256Driver::waitDRDY(uint32_t timeoutMs) {
  const uint32_t startedAt = millis();
  while (digitalRead(PIN_ADS_DRDY) == HIGH) {
    if ((millis() - startedAt) > timeoutMs) {
      return false;
    }
    delay(1);
  }
  return true;
}

bool ADS1256Driver::begin() {
  _isInitialized = false;
  _drdyTimeoutStreak = 0;
  _lastInitFailReason = INIT_OK;

  pinMode(PIN_ADS_CS, OUTPUT);
  digitalWrite(PIN_ADS_CS, HIGH);
  pinMode(PIN_ADS_DRDY, INPUT);

  if (PIN_ADS_PDWN >= 0) {
    pinMode(PIN_ADS_PDWN, OUTPUT);
    digitalWrite(PIN_ADS_PDWN, HIGH);
    delay(10);
  }

  Serial.printf(
      "[ADS1256] SCK=%d MOSI=%d MISO=%d CS=%d DRDY=%d PDWN=%d\n",
      PIN_ADS_SCK,
      PIN_ADS_MOSI,
      PIN_ADS_MISO,
      PIN_ADS_CS,
      PIN_ADS_DRDY,
      PIN_ADS_PDWN);

  _spi.begin(PIN_ADS_SCK, PIN_ADS_MISO, PIN_ADS_MOSI, PIN_ADS_CS);
  if (!waitDRDY(500)) {
    _lastInitFailReason = FAIL_DRDY_BEFORE_INIT;
    Serial.println("[ADS1256] DRDY not ready before config; continuing");
  }

  sendCommand(ADS_CMD_SDATAC);
  delay(5);
  _isInitialized = true;

  writeRegister(ADS_REG_STATUS, 0x00);
  setDifferentialChannel(ADS_MUX_CURRENT_DIFF);
  writeRegister(ADS_REG_ADCON, 0x00);
  writeRegister(ADS_REG_DRATE, ADS_DRATE_1000_SPS);
  delay(5);

  sendCommand(ADS_CMD_SELFCAL);
  if (!waitDRDY(2000)) {
    _lastInitFailReason = FAIL_DRDY_SELFCAL;
    _isInitialized = false;
    return false;
  }

  const uint8_t status = readRegisterWithRetry(ADS_REG_STATUS);
  const uint8_t mux = readRegisterWithRetry(ADS_REG_MUX);
  const uint8_t adcon = readRegisterWithRetry(ADS_REG_ADCON);
  const uint8_t drate = readRegisterWithRetry(ADS_REG_DRATE);

  if (status == 0xFF && mux == 0xFF && adcon == 0xFF && drate == 0xFF) {
    _lastInitFailReason = FAIL_REGS_ALL_FF;
    _isInitialized = false;
    return false;
  }

  if (drate != ADS_DRATE_1000_SPS) {
    _lastInitFailReason = FAIL_DRATE_MISMATCH;
    _isInitialized = false;
    return false;
  }

  _lastInitFailReason = INIT_OK;
  return true;
}

void ADS1256Driver::setDifferentialChannel(uint8_t muxValue) {
  if (!_isInitialized) {
    return;
  }
  writeRegister(ADS_REG_MUX, muxValue);
  delayMicroseconds(10);
}

int32_t ADS1256Driver::readRaw() {
  if (!_isInitialized) {
    return 0;
  }

  if (!waitDRDY(1000)) {
    _drdyTimeoutStreak++;
    if (_drdyTimeoutStreak >= 5) {
      Serial.println("[ADS1256] disabling ADC after repeated DRDY timeouts");
      _isInitialized = false;
    }
    return 0;
  }
  _drdyTimeoutStreak = 0;

  _spi.beginTransaction(SPISettings(ADS_SPI_HZ, MSBFIRST, ADS_SPI_MODE));
  chipSelect(true);
  _spi.transfer(ADS_CMD_RDATA);
  delayMicroseconds(10);

  const uint8_t b0 = _spi.transfer(0xFF);
  const uint8_t b1 = _spi.transfer(0xFF);
  const uint8_t b2 = _spi.transfer(0xFF);

  chipSelect(false);
  _spi.endTransaction();

  int32_t value = ((int32_t)b0 << 16) | ((int32_t)b1 << 8) | b2;
  if (value & 0x800000) {
    value |= 0xFF000000;
  }
  return value;
}

void ADS1256Driver::writeRegister(uint8_t reg, uint8_t value) {
  if (!_isInitialized) {
    return;
  }
  _spi.beginTransaction(SPISettings(ADS_SPI_HZ, MSBFIRST, ADS_SPI_MODE));
  chipSelect(true);
  _spi.transfer(ADS_CMD_WREG | reg);
  _spi.transfer(0x00);
  _spi.transfer(value);
  chipSelect(false);
  _spi.endTransaction();
  delayMicroseconds(10);
}

uint8_t ADS1256Driver::readRegister(uint8_t reg) {
  if (!_isInitialized) {
    return 0xFF;
  }
  _spi.beginTransaction(SPISettings(ADS_SPI_HZ, MSBFIRST, ADS_SPI_MODE));
  chipSelect(true);
  _spi.transfer(ADS_CMD_RREG | reg);
  _spi.transfer(0x00);
  delayMicroseconds(10);
  const uint8_t value = _spi.transfer(0xFF);
  chipSelect(false);
  _spi.endTransaction();
  return value;
}

uint8_t ADS1256Driver::readRegisterWithRetry(uint8_t reg, uint8_t attempts) {
  uint8_t last = 0xFF;
  for (uint8_t index = 0; index < attempts; index++) {
    last = readRegister(reg);
    delayMicroseconds(20);
  }
  return last;
}
