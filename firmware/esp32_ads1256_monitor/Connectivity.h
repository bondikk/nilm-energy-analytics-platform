#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>

class Connectivity {
public:
  Connectivity();

  void begin();
  bool connectWiFi(unsigned long timeoutMs = 15000);
  void loop();
  void syncTime();

  bool isWiFiConnected() const;
  bool isMQTTConnected();
  String iso8601();

  bool publishTelemetry(
      float currentRms,
      float voltageRms,
      float apparentPowerVa,
      bool voltageFallback);

private:
  WiFiClient _wifiClient;
  PubSubClient _mqtt;
  unsigned long _lastMqttAttemptMs;
  unsigned long _lastWiFiRetryMs;

  void setupMQTT();
  void reconnectMQTTNonBlocking();
};
