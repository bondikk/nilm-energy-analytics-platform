#include "CurrentSensor.h"

#include <math.h>

#include "config.h"

CurrentSensor::CurrentSensor(ADS1256Driver& adc) : _adc(adc) {}

bool CurrentSensor::begin() {
  _adc.setDifferentialChannel(ADS_MUX_CURRENT_DIFF);
  return true;
}

float CurrentSensor::readCurrentRMS(uint16_t samples) {
  if (!_adc.isAvailable() || samples == 0) {
    return 0.0f;
  }

  _adc.setDifferentialChannel(ADS_MUX_CURRENT_DIFF);

  double mean = 0.0;
  double m2 = 0.0;
  uint16_t count = 0;

  for (uint16_t index = 0; index < samples; index++) {
    const float current = voltsToPrimaryCurrent(rawToVolts(_adc.readRaw()));
    count++;
    const double delta = current - mean;
    mean += delta / count;
    m2 += delta * (current - mean);
  }

  return sqrt(m2 / count);
}

float CurrentSensor::rawToVolts(int32_t raw) const {
  const float fullScale = (2.0f * ADS_VREF) / ADS_PGA_GAIN;
  return ((float)raw / 8388607.0f) * fullScale;
}

float CurrentSensor::voltsToPrimaryCurrent(float differentialVolts) const {
  return (differentialVolts / CT_BURDEN_OHMS) * CT_TURNS_RATIO * CURRENT_CALIBRATION;
}
