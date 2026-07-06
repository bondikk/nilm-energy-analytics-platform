#pragma once

#include <Arduino.h>

#include "ADS1256Driver.h"

class VoltageSensor {
public:
  explicit VoltageSensor(ADS1256Driver& adc);

  bool begin();
  float readVoltageRMS(uint16_t samples);

private:
  ADS1256Driver& _adc;
};
