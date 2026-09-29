// Adafruit "DHT sensor library" API on the virtual board.
// Readings come from the test case: temp=…, humidity=… (dht=error makes reads fail → NAN).
#pragma once
#include <Arduino.h>

#define DHT11 11
#define DHT12 12
#define DHT21 21
#define DHT22 22
#define AM2301 21

class DHT {
 public:
  DHT(uint8_t pin, uint8_t type, uint8_t = 6) : pin_(pin), type_(type) {}
  void begin(uint8_t = 55) { begun_ = true; }
  float readTemperature(bool isFahrenheit = false, bool = false) {
    if (!read()) return NAN;
    float t = sim::value("temp", 25);
    if (type_ == DHT11) t = (float)(floor(t) + ((int)lround((t - floor(t)) * 10) % 10) / 10.0);
    else t = roundf(t * 10) / 10;
    return isFahrenheit ? convertCtoF(t) : t;
  }
  float readHumidity(bool = false) {
    if (!read()) return NAN;
    float h = sim::value("humidity", 50);
    return type_ == DHT11 ? (float)lround(h) : roundf(h * 10) / 10;
  }
  float convertCtoF(float c) { return c * 1.8f + 32; }
  float convertFtoC(float f) { return (f - 32) * 0.55555f; }
  float computeHeatIndex(bool isFahrenheit = true) {
    return computeHeatIndex(readTemperature(isFahrenheit), readHumidity(), isFahrenheit);
  }
  float computeHeatIndex(float temperature, float percentHumidity, bool isFahrenheit = true) {
    float hi;
    if (!isFahrenheit) temperature = convertCtoF(temperature);
    hi = 0.5f * (temperature + 61.0f + ((temperature - 68.0f) * 1.2f) + (percentHumidity * 0.094f));
    if (hi > 79) {
      hi = -42.379f + 2.04901523f * temperature + 10.14333127f * percentHumidity +
           -0.22475541f * temperature * percentHumidity +
           -0.00683783f * pow(temperature, 2) + -0.05481717f * pow(percentHumidity, 2) +
           0.00122874f * pow(temperature, 2) * percentHumidity +
           0.00085282f * temperature * pow(percentHumidity, 2) +
           -0.00000199f * pow(temperature, 2) * pow(percentHumidity, 2);
      if ((percentHumidity < 13) && (temperature >= 80.0f) && (temperature <= 112.0f))
        hi -= ((13.0f - percentHumidity) * 0.25f) * sqrt((17.0f - fabs(temperature - 95.0f)) * 0.05882f);
      else if ((percentHumidity > 85.0f) && (temperature >= 80.0f) && (temperature <= 87.0f))
        hi += ((percentHumidity - 85.0f) * 0.1f) * ((87.0f - temperature) * 0.2f);
    }
    return isFahrenheit ? hi : convertFtoC(hi);
  }
  bool read(bool = false) {
    sim::advance(5000);  // a real DHT read takes a few milliseconds
    return !sim::has("dht");
  }

 private:
  uint8_t pin_, type_;
  bool begun_ = false;
};
