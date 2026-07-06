#include "VoltageSensor.h"

#include <math.h>

#include "config.h"

VoltageSensor::VoltageSensor(ADS1256Driver& adc) : _adc(adc) {}

bool VoltageSensor::begin() {
  return true;
}

float VoltageSensor::readVoltageRMS(uint16_t samples) {
  if (!VOLTAGE_SENSOR_ENABLED || !_adc.isAvailable() || samples == 0) {
    return 0.0f;
  }

  _adc.setDifferentialChannel(ADS_MUX_VOLTAGE_DIFF);

  double mean = 0.0;
  double m2 = 0.0;
  uint16_t count = 0;

  for (uint16_t index = 0; index < samples; index++) {
    const float volts = ((float)_adc.readRaw() / 8388607.0f) * (2.0f * ADS_VREF);
    count++;
    const double delta = volts - mean;
    mean += delta / count;
    m2 += delta * (volts - mean);
  }

  return sqrt(m2 / count) * VOLTAGE_CALIBRATION;
}
