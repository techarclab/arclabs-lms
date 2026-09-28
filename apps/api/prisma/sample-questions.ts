/** Starter question bank (IoT / embedded / electronics). Used by the seed script. */
type Q =
  | {
      type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
      prompt: string;
      options: string[];
      correct: number[];
      topic: string;
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      points?: number;
      explanation?: string;
    }
  | {
      type: 'TRUE_FALSE';
      prompt: string;
      answer: boolean;
      topic: string;
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      points?: number;
      explanation?: string;
    }
  | {
      type: 'NUMERIC';
      prompt: string;
      value: number;
      tolerance: number;
      topic: string;
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      points?: number;
      explanation?: string;
    };

export const SAMPLE_QUESTIONS: Q[] = [
  {
    type: 'SINGLE_CHOICE',
    topic: 'ESP32',
    difficulty: 'EASY',
    prompt: 'Which wireless technologies are built into a standard ESP32?',
    options: ['Wi-Fi and Bluetooth', 'Wi-Fi only', 'Zigbee and LoRa', 'Bluetooth only'],
    correct: [0],
    explanation: 'The ESP32 integrates 2.4 GHz Wi-Fi and Bluetooth (Classic + BLE).',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'ESP32',
    difficulty: 'MEDIUM',
    prompt: 'What is the logic-level voltage of ESP32 GPIO pins?',
    options: ['1.8 V', '3.3 V', '5 V', '12 V'],
    correct: [1],
    explanation: 'ESP32 GPIOs are 3.3 V and are not 5 V tolerant.',
  },
  {
    type: 'TRUE_FALSE',
    topic: 'ESP32',
    difficulty: 'MEDIUM',
    prompt: 'ESP32 GPIO pins can safely accept a 5 V input signal without level shifting.',
    answer: false,
    explanation: 'Use a level shifter or voltage divider for 5 V signals.',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'GPIO',
    difficulty: 'EASY',
    prompt:
      'Which Arduino function configures a pin as an input with the internal pull-up resistor enabled?',
    options: [
      'pinMode(pin, INPUT)',
      'pinMode(pin, INPUT_PULLUP)',
      'digitalWrite(pin, HIGH)',
      'analogRead(pin)',
    ],
    correct: [1],
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'GPIO',
    difficulty: 'MEDIUM',
    prompt:
      'A push-button is wired between a pin configured as INPUT_PULLUP and GND. What does digitalRead() return while the button is pressed?',
    options: ['HIGH', 'LOW', 'It alternates', 'An analog value'],
    correct: [1],
    explanation: 'Pressing connects the pin to GND, so it reads LOW (active-low).',
  },
  {
    type: 'TRUE_FALSE',
    topic: 'GPIO',
    difficulty: 'EASY',
    prompt: 'PWM (Pulse Width Modulation) can be used to control the brightness of an LED.',
    answer: true,
  },
  {
    type: 'NUMERIC',
    topic: 'Electronics',
    difficulty: 'MEDIUM',
    points: 2,
    prompt:
      'An LED with a forward voltage of 2 V must run at 20 mA from a 5 V supply. What series resistance (in ohms) is required?',
    value: 150,
    tolerance: 1,
    explanation: 'R = (5 − 2) / 0.02 = 150 Ω.',
  },
  {
    type: 'NUMERIC',
    topic: 'Electronics',
    difficulty: 'EASY',
    prompt:
      'A 10 kΩ and a 10 kΩ resistor form a voltage divider across 3.3 V. What is the output voltage (V)?',
    value: 1.65,
    tolerance: 0.01,
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'Electronics',
    difficulty: 'MEDIUM',
    prompt: 'Why is a flyback diode placed across a relay coil?',
    options: [
      'To increase switching speed',
      'To protect the driver transistor from voltage spikes',
      'To reduce coil current',
      'To make the relay latch',
    ],
    correct: [1],
  },
  {
    type: 'MULTIPLE_CHOICE',
    topic: 'Protocols',
    difficulty: 'MEDIUM',
    points: 2,
    prompt: 'Which of the following are serial communication protocols commonly used with sensors?',
    options: ['I2C', 'SPI', 'UART', 'PWM'],
    correct: [0, 1, 2],
    explanation: 'PWM is a modulation technique, not a communication protocol.',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'Protocols',
    difficulty: 'EASY',
    prompt: 'How many signal wires (excluding power and ground) does I2C use?',
    options: ['1', '2', '3', '4'],
    correct: [1],
    explanation: 'SDA (data) and SCL (clock).',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'Protocols',
    difficulty: 'HARD',
    prompt: 'On an I2C bus, what resolves two devices trying to transmit at the same time?',
    options: [
      'Chip-select lines',
      'Bus arbitration on SDA',
      'Baud-rate negotiation',
      'A dedicated interrupt line',
    ],
    correct: [1],
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'MQTT',
    difficulty: 'EASY',
    prompt:
      'In MQTT, what is the component that receives all messages and routes them to subscribers?',
    options: ['Publisher', 'Broker', 'Topic', 'Gateway'],
    correct: [1],
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'MQTT',
    difficulty: 'MEDIUM',
    prompt: 'Which MQTT QoS level guarantees a message is delivered exactly once?',
    options: ['QoS 0', 'QoS 1', 'QoS 2', 'QoS 3'],
    correct: [2],
  },
  {
    type: 'MULTIPLE_CHOICE',
    topic: 'MQTT',
    difficulty: 'HARD',
    points: 2,
    prompt: 'Which topic filters match the topic "lab/esp32/temperature"?',
    options: ['lab/+/temperature', 'lab/#', 'lab/esp32', '+/+/+'],
    correct: [0, 1, 3],
    explanation: '+ matches exactly one level; # matches all remaining levels.',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'Sensors',
    difficulty: 'EASY',
    prompt: 'Which sensor is commonly used to measure temperature and humidity together?',
    options: ['HC-SR04', 'DHT11 / DHT22', 'MPU6050', 'LDR'],
    correct: [1],
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'Sensors',
    difficulty: 'MEDIUM',
    prompt:
      'The HC-SR04 ultrasonic sensor returns an echo pulse of 1160 µs. Approximately how far is the object? (speed of sound ≈ 343 m/s)',
    options: ['10 cm', '20 cm', '40 cm', '1 m'],
    correct: [1],
    explanation: 'Distance = (1160 µs × 343 m/s) / 2 ≈ 19.9 cm.',
  },
  {
    type: 'NUMERIC',
    topic: 'Sensors',
    difficulty: 'HARD',
    points: 2,
    prompt:
      'A 10-bit ADC with a 3.3 V reference reads 512. What is the input voltage (V)? Round to two decimals.',
    value: 1.65,
    tolerance: 0.01,
    explanation: 'V = 512 / 1023 × 3.3 ≈ 1.65 V.',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'C basics',
    difficulty: 'EASY',
    prompt: 'What is printed?\n```c\nint x = 7;\nprintf("%d", x / 2);\n```',
    options: ['3', '3.5', '4', '7'],
    correct: [0],
    explanation: 'Integer division truncates.',
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'C basics',
    difficulty: 'MEDIUM',
    prompt:
      'Which keyword should be used for a variable modified inside an interrupt service routine and read in loop()?',
    options: ['static', 'const', 'volatile', 'register'],
    correct: [2],
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'C basics',
    difficulty: 'HARD',
    prompt:
      'What is the value of `flags` after this code?\n```c\nuint8_t flags = 0b00001010;\nflags |= (1 << 0);\nflags &= ~(1 << 3);\n```',
    options: ['0b00000011', '0b00001011', '0b00000010', '0b00001001'],
    correct: [0],
  },
  {
    type: 'TRUE_FALSE',
    topic: 'C basics',
    difficulty: 'MEDIUM',
    prompt: 'Calling delay() inside an interrupt service routine is recommended.',
    answer: false,
  },
  {
    type: 'SINGLE_CHOICE',
    topic: 'IoT architecture',
    difficulty: 'MEDIUM',
    prompt:
      'Which layer of a typical IoT architecture is responsible for collecting data from the physical world?',
    options: ['Application layer', 'Perception (sensing) layer', 'Network layer', 'Business layer'],
    correct: [1],
  },
  {
    type: 'MULTIPLE_CHOICE',
    topic: 'IoT architecture',
    difficulty: 'MEDIUM',
    prompt: 'Which of these are low-power wide-area (LPWAN) technologies?',
    options: ['LoRaWAN', 'NB-IoT', 'Wi-Fi 6', 'Sigfox'],
    correct: [0, 1, 3],
  },
];
