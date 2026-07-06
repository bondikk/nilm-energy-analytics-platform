#pragma once

#include <Arduino.h>

class PowerMetrics {
public:
  static float apparentPower(float voltageRms, float currentRms);
};
