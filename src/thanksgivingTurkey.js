export function initThanksgivingTurkey() {
  const turkey = document.querySelector(".thanksgiving-turkey");
  const button = turkey.querySelector("button");
  const theme = document.documentElement.dataset;
  const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");

  function stopRun() {
    turkey.classList.remove("running");
  }

  turkey.addEventListener("animationend", stopRun);
  turkey.addEventListener("animationcancel", stopRun);
  button.addEventListener("click", () => {
    const audio = new Audio("/sounds/gobble.mp3");
    audio.play().catch(() => {});
  });

  function scheduleRun() {
    setTimeout(
      () => {
        if (
          !document.hidden &&
          theme.season === "thanksgiving" &&
          theme.seasonEffects !== "off" &&
          motion.matches
        ) {
          turkey.classList.add("running");
        }

        scheduleRun();
      },
      20000 + Math.random() * 20000
    );
  }

  scheduleRun();
}
