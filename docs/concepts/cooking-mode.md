# Cooking mode

Tablet-first, landscape and portrait.

- One step per screen, large type, swipe or tap to advance; overview of all steps on the side in landscape.
- Ingredients used in the current step are shown next to it (step <-> ingredient refs, auto-detected by
  name matching at save time, editable).
- Servings selector scales all quantities live.
- Screen Wake Lock while the view is open.
- Timers: durations in step text ("15 Minuten", "1-2 hours") are detected and shown as tappable timers.
  Multiple timers run in parallel, survive navigation, and alert with sound + vibration.
- Numeric German/English durations include decimal commas and ranges. Ranges
  use the upper bound; adjacent descending units such as "1 hour 30 minutes"
  form one timer. Durations are bounded to one second through seven days.
- Timers belong to the active household on this browser and are saved locally
  with absolute deadlines. Pause preserves the remaining duration; resume creates
  a new deadline. Navigation and reload preserve running, paused and completed
  timers; an overdue timer alerts once when the application runs again.
- Keep the app open for timely alerts. A suspended or closed browser cannot run
  the alarm code. Audio needs a user gesture after reload; unsupported sound,
  vibration, notifications or local storage are reported in the timer dock.
  Notification permission is requested only by its explicit control. Granted
  notifications use the active service worker when available.
- Later: voice commands (next, back, start timer) via Web Speech API.
