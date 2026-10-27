import "@kadr/ui/theme.css";
import "../styles.css";
import type { SessionSnapshot } from "../../../shared/api";

// The frame around a recorded region: red while recording, amber while paused. No React needed.
const show = (snapshot: SessionSnapshot) =>
  document.body.classList.toggle("frame-page--paused", snapshot.status === "paused");
void window.kadr.session.get().then(show);
window.kadr.session.onChange(show);
