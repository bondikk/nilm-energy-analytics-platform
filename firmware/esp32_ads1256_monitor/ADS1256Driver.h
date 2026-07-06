#pragma once

#include <Arduino.h>
#include <SPI.h>

class ADS1256Driver {
public:
  enum InitFailReason : uint8_t {
    INIT_OK = 0,
    FAIL_DRDY_BEFORE_INIT,
    FAIL_DRDY_SELFCAL,
    FAIL_REGS_ALL_FF,
    FAIL_DRATE_MISMATCH
  };

  ADS1256Driver();

  bool begin();
  bool isAvailable() const;
  InitFailReason getLastInitFailReason() const;
  const char* getLastInitFailReasonStr() const;

  void setDifferentialChannel(uint8_t muxValue);
  int32_t readRaw();

  uint8_t readRegister(uint8_t reg);
  uint8_t readRegisterWithRetry(uint8_t reg, uint8_t attempts = 3);
  void writeRegister(uint8_t reg, uint8_t value);

private:
  SPIClass _spi;
  bool _isInitialized;
  uint8_t _drdyTimeoutStreak;
  InitFailReason _lastInitFailReason;

  void chipSelect(bool enabled);
  void sendCommand(uint8_t command);
  bool waitDRDY(uint32_t timeoutMs = 1000);
};
