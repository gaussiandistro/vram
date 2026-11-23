const PI_DIGITS =
  "314159265358979323846264338327950288419716939937510" +
  "58209749445923078164062862089986280348253421170679" +
  "82148086513282306647093844609550582231725359408128" +
  "48111745028410270193852110555964462294895493038196";

const MESSAGES = [
  [50, "Stop typing pi and get back to work"],
  [20, "Wow. NASA doesn't even use this many"],
  [10, "Pretty good!"],
  [5, "Respectable. You can do better though!"],
  [0, "Give it another try."],
];

export function initPumpkinPie() {
  const status = document.getElementById("pumpkinPieStatus");
  const input = document.getElementById("pumpkinPieInput");
  const retry = document.getElementById("pumpkinPieRetry");
  const instructions = status.textContent;

  input.addEventListener("input", () => {
    const entry = input.value.replace(/[^0-9.]/g, "");
    const hasDecimal = entry.startsWith("3.");
    const digits = entry.replaceAll(".", "");
    let score = 0;

    while (score < digits.length && digits[score] === PI_DIGITS[score]) {
      score++;
    }

    input.value = hasDecimal ? `3.${digits.slice(1, score)}` : digits.slice(0, score);
    if (score === digits.length && score < PI_DIGITS.length) return;

    const [, message] = MESSAGES.find(([minimum]) => score >= minimum);
    const nextDigit = PI_DIGITS[score];
    const hint = nextDigit ? `\nThe next digit was ${nextDigit}.` : "";
    status.textContent = `${score} correct. ${message}${hint}`;
    input.readOnly = true;
    retry.hidden = false;
    retry.focus();
  });

  retry.addEventListener("click", () => {
    input.value = "";
    input.readOnly = false;
    status.textContent = instructions;
    retry.hidden = true;
    input.focus();
  });
}
