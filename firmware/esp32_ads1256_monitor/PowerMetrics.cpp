#include "PowerMetrics.h"

float PowerMetrics::apparentPower(float voltageRms, float currentRms) {
  return voltageRms * currentRms;
}
