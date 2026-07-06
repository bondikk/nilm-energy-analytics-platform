#include <Arduino.h>

#include "ADS1256Driver.h"
#include "Connectivity.h"
#include "CurrentSensor.h"
#include "PowerMetrics.h"
#include "VoltageSensor.h"
#include "config.h"
#include "secrets.h"

ADS1256Driver adc;
CurrentSensor currentSensor(adc);
VoltageSensor voltageSensor(adc);
Connectivity connectivity;

static bool adsReady = false;
static unsigned long lastAdsInitAttemptMs = 0;

static void initAdsSafely() {
  lastAdsInitAttemptMs = millis();
  Serial.println("[ADS1256] init");
  adsReady = adc.begin();

  if (!adsReady) {
    Serial.print("[ADS1256] unavailable: ");
    Serial.println(adc.getLastInitFailReasonStr());
    return;
  }

  currentSensor.begin();
  voltageSensor.begin();
  Serial.println("[ADS1256] ready");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("=== VoltPulse ESP32 ADS1256 monitor ===");

  connectivity.begin();
  initAdsSafely();

  if (connectivity.connectWiFi()) {
    connectivity.syncTime();
  }
}

void loop() {
  static unsigned long lastPublishMs = 0;
  const unsigned long now = millis();

  connectivity.loop();

  if (!adsReady && now - lastAdsInitAttemptMs >= ADS_REINIT_INTERVAL_MS) {
    initAdsSafely();
  }

  if (now - lastPublishMs < PUBLISH_INTERVAL_MS) {
    return;
  }
  lastPublishMs = now;

  const float currentRms = adsReady ? currentSensor.readCurrentRMS(RMS_SAMPLES) : 0.0f;
  float voltageRms = adsReady ? voltageSensor.readVoltageRMS(RMS_SAMPLES) : 0.0f;
  bool voltageFallback = false;

  if (voltageRms <= 1.0f) {
    voltageRms = NOMINAL_MAINS_V_RMS;
    voltageFallback = true;
  }

  const float apparentPowerVa = PowerMetrics::apparentPower(voltageRms, currentRms);
  Serial.printf(
      "[MEAS] current=%.3f A voltage=%.2f V apparent=%.1f VA fallback_voltage=%s\n",
      currentRms,
      voltageRms,
      apparentPowerVa,
      voltageFallback ? "true" : "false");

  connectivity.publishTelemetry(currentRms, voltageRms, apparentPowerVa, voltageFallback);
}
