#pragma once

#include <Arduino.h>

#define FIRMWARE_VERSION "0.1.0"
#define TELEMETRY_SOURCE "esp32_ads1256"

// ESP32 VSPI wiring for ADS1256.
static const int PIN_ADS_SCK = 18;
static const int PIN_ADS_MOSI = 23;
static const int PIN_ADS_MISO = 19;
static const int PIN_ADS_CS = 5;
static const int PIN_ADS_DRDY = 34;
static const int PIN_ADS_PDWN = 27;

// ADS1256 input mux. 0x01 is differential AIN0-AIN1 for SCT-013 current sensing.
static const uint8_t ADS_MUX_CURRENT_DIFF = 0x01;

// Set this true only after adding an isolated voltage sensing circuit and calibration.
static const bool VOLTAGE_SENSOR_ENABLED = false;
static const uint8_t ADS_MUX_VOLTAGE_DIFF = 0x23;

// ADS1256 and analog-front-end calibration constants.
static const float ADS_VREF = 2.5f;
static const float ADS_PGA_GAIN = 1.0f;
static const float CT_BURDEN_OHMS = 10.0f;
static const float CT_TURNS_RATIO = 2000.0f;
static const float CURRENT_CALIBRATION = 1.0f;
static const float VOLTAGE_CALIBRATION = 1.0f;

// Lab fallback. This is nominal RMS voltage, not a measured waveform.
static const float NOMINAL_MAINS_V_RMS = 230.0f;
static const float NOMINAL_FREQUENCY_HZ = 50.0f;

static const uint16_t RMS_SAMPLES = 200;
static const uint16_t ADS_SAMPLE_RATE_SPS = 1000;
static const unsigned long PUBLISH_INTERVAL_MS = 1000;
static const unsigned long ADS_REINIT_INTERVAL_MS = 15000;
