#pragma once

#include <Arduino.h>

#include "ADS1256Driver.h"

class CurrentSensor {
public:
  explicit CurrentSensor(ADS1256Driver& adc);

  bool begin();
  float readCurrentRMS(uint16_t samples);

private:
  ADS1256Driver& _adc;

  float rawToVolts(int32_t raw) const;
  float voltsToPrimaryCurrent(float differentialVolts) const;
};
