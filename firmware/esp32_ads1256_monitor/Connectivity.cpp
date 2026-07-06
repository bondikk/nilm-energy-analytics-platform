#include "Connectivity.h"

#include <ArduinoJson.h>
#include <time.h>

#include "config.h"
#include "secrets.h"

Connectivity::Connectivity()
    : _mqtt(_wifiClient),
      _lastMqttAttemptMs(0),
      _lastWiFiRetryMs(0) {}

void Connectivity::begin() {
  setupMQTT();
}

void Connectivity::setupMQTT() {
  _mqtt.setServer(MQTT_HOST, MQTT_PORT);
  _mqtt.setKeepAlive(30);
  _mqtt.setSocketTimeout(10);
}

bool Connectivity::connectWiFi(unsigned long timeoutMs) {
  Serial.printf("[WIFI] connecting to %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startedAt) < timeoutMs) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[WIFI] failed, status=%d\n", WiFi.status());
    return false;
  }

  Serial.print("[WIFI] connected, ip=");
  Serial.println(WiFi.localIP());
  return true;
}

void Connectivity::loop() {
  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (now - _lastWiFiRetryMs >= 10000) {
      _lastWiFiRetryMs = now;
      Serial.println("[WIFI] reconnect");
      WiFi.reconnect();
    }
    return;
  }

  reconnectMQTTNonBlocking();
  _mqtt.loop();
}

void Connectivity::reconnectMQTTNonBlocking() {
  const unsigned long now = millis();
  if (_mqtt.connected() || WiFi.status() != WL_CONNECTED || now - _lastMqttAttemptMs < 3000) {
    return;
  }

  _lastMqttAttemptMs = now;
  Serial.printf("[MQTT] connecting to %s:%d\n", MQTT_HOST, MQTT_PORT);

  const bool hasCredentials = strlen(MQTT_USERNAME) > 0;
  const bool connected = hasCredentials
      ? _mqtt.connect(DEVICE_EXTERNAL_ID, MQTT_USERNAME, MQTT_PASSWORD)
      : _mqtt.connect(DEVICE_EXTERNAL_ID);

  if (!connected) {
    Serial.printf("[MQTT] connection failed, rc=%d\n", _mqtt.state());
  }
}

void Connectivity::syncTime() {
  Serial.println("[TIME] syncing NTP");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  struct tm timeInfo;
  for (uint8_t attempt = 0; attempt < 20; attempt++) {
    if (getLocalTime(&timeInfo)) {
      Serial.println("[TIME] synced");
      return;
    }
    delay(250);
  }
  Serial.println("[TIME] NTP sync failed");
}

bool Connectivity::isWiFiConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

bool Connectivity::isMQTTConnected() {
  return _mqtt.connected();
}

String Connectivity::iso8601() {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo)) {
    return "";
  }

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(buffer);
}

bool Connectivity::publishTelemetry(
    float currentRms,
    float voltageRms,
    float apparentPowerVa,
    bool voltageFallback) {
  if (!isWiFiConnected() || !isMQTTConnected()) {
    Serial.println("[PUB] skipped: network not ready");
    return false;
  }

  const String timestamp = iso8601();
  if (timestamp.length() == 0) {
    Serial.println("[PUB] skipped: time is not synced");
    return false;
  }

  StaticJsonDocument<384> doc;
  doc["ts"] = timestamp;
  doc["device_external_id"] = DEVICE_EXTERNAL_ID;
  doc["current_a"] = roundf(currentRms * 1000.0f) / 1000.0f;
  doc["voltage_v"] = roundf(voltageRms * 100.0f) / 100.0f;
  doc["apparent_power_va"] = roundf(apparentPowerVa * 10.0f) / 10.0f;
  doc["active_power_w"] = nullptr;
  doc["power_factor"] = nullptr;
  doc["frequency_hz"] = NOMINAL_FREQUENCY_HZ;

  JsonObject raw = doc.createNestedObject("raw_payload");
  raw["source"] = TELEMETRY_SOURCE;
  raw["sample_rate"] = ADS_SAMPLE_RATE_SPS;
  raw["firmware_version"] = FIRMWARE_VERSION;
  raw["voltage_fallback"] = voltageFallback;

  char payload[384];
  serializeJson(doc, payload, sizeof(payload));

  Serial.print("[PUB] ");
  Serial.println(payload);
  return _mqtt.publish(MQTT_TOPIC, payload);
}
