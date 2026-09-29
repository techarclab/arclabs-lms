# Arduino (embedded C) coding questions

There are two ways to mark an Arduino question:

- **AI marking (no test cases)** — students write the sketch any way they like; it is compiled on
  submit and marked against your marking scheme with partial marks. Set it up in the question
  editor ("How is it marked?") — see `docs/DEPLOYMENT.md` §10. Nothing below is needed for it.
- **Test cases on the virtual board** — described below.

Students write a normal Arduino sketch in the exam. It is compiled with our own copies of the
Arduino libraries and runs on a **virtual board**. There's no real hardware: each test case describes
what the sensors read, and the sketch's output is checked.

## What students can use

- **Core:** `setup()` / `loop()`, `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`,
  `analogWrite`, `delay`, `millis`, `micros`, `pulseIn`, `tone`, `map`, `constrain`, `attachInterrupt`
- **Serial:** `Serial.begin/print/println/printf/available/read/parseInt`
- **Text:** `String`
- **Libraries:** `#include <DHT.h>` (Adafruit), `<dht.h>` (DHTlib), `<Servo.h>`, `<LiquidCrystal.h>`,
  `<LiquidCrystal_I2C.h>`, `<Wire.h>`, `<SPI.h>`
- **Reading the DHT11/22 by hand** (bit-banging the protocol) also works: add `dht_pin=2` to the
  test.

`delay(2000)` takes no real time: the board's clock is simulated, so a 5-second test finishes
instantly.

## Test case settings (one per line)

| Setting                 | Meaning                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `temp=31` `humidity=70` | DHT readings                                                                                                           |
| `dht=error`             | DHT not responding (library returns NAN)                                                                               |
| `D2=LOW`                | digital input on pin 2 (button, PIR, IR…). `INPUT_PULLUP` pins are HIGH unless set                                     |
| `A0=512`                | analog input 0–1023 (LDR, LM35: `°C × 2.046`, potentiometer, soil, MQ gas…)                                            |
| `distance=25`           | HC-SR04 distance in cm                                                                                                 |
| `serial=12\n`           | text typed into the Serial Monitor                                                                                     |
| `@2000 D2=LOW`          | change something at 2000 ms (several: `@2000 temp=40, humidity=20`)                                                    |
| `time=5000`             | how long the sketch runs (default 3000 ms)                                                                             |
| `trace=D8`              | also check pin 8 (LED, relay, buzzer, servo…) — printed as `D8 HIGH` / `D8 LOW`. `trace=D8+D9` or `trace=pins` for all |
| `trace_time=on`         | add the time to pin lines (`[2004 ms] D8 HIGH`) — only for timing questions like blink rates                           |

## What is compared

1. Everything printed with `Serial`
2. Traced pin changes, e.g. `D8 HIGH`
3. The LCD's final screen, printed at the end under `--- LCD ---`

## Writing a question (easiest way)

1. Choose **Arduino** as the language; keep **Output check: Flexible** (ignores spaces, upper/lower
   case and number formatting: `31`, `31.0` and `31.00` all count as the same).
2. Add test cases with only the settings — leave **Expected output empty**.
3. Paste your reference solution and **Save**. The expected outputs are filled in automatically by
   running your solution (you can see them when you reopen the question).
4. Mark 1–2 tests as **Sample** so students can practise, and keep the rest **Hidden**.

## Example: DHT11 fan control

- **Question:** DHT11 on pin 2. Every 2 s print `Temp: <t> C  Humidity: <h> %`. Above 30 °C turn
  on the fan on pin 8 and print `FAN ON`. If the sensor fails, print `Sensor error`.
- **Tests:**
  - `temp=31 / humidity=70 / trace=D8` (fan turns on)
  - `temp=24 / humidity=40 / trace=D8` (fan stays off)
  - `temp=28 / @2500 temp=33 / trace=D8 / time=5000` (it gets hot mid-way)
  - `dht=error`
