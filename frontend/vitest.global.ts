// Pin a non-UTC timezone so date logic (local vs UTC) is tested the same on every machine / CI.
export default function setup() {
  process.env.TZ = "America/Los_Angeles";
}
