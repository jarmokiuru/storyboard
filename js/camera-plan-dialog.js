// The camera plan's export dialog (Jarmo, 2026-11-21): a preview of the picture with a tick box for each thing it
// can show (extras' names, angle of view, furniture…). The preview redraws on every tick; the choice is kept with
// the project (project.planOptions) for next time.

import { formDialog, toast } from "./ui.js";
import { scenePlan, PLAN_OPTIONS, planOptions } from "./scene-plan.js";

// Returns the finished plan ({ blob, … }) or null when cancelled.
export async function chooseCameraPlan(project, scene, loc) {
  const opts = planOptions(project.planOptions);
  const first = await scenePlan(project, scene, loc, opts, { asBlob: false });
  if (!first.cameras) {
    toast("No board in this scene has a camera yet. Set one up in the Shot Generator.", 5000);
    return null;
  }

  const box = document.createElement("div");
  box.className = "plan-choose";
  const preview = document.createElement("div");
  preview.className = "plan-preview";
  const checks = document.createElement("div");
  checks.className = "plan-checks";
  for (const [key, label] of PLAN_OPTIONS) {
    const row = document.createElement("label");
    row.className = "check";
    row.innerHTML = `<input type="checkbox" data-opt="${key}"><span></span>`;
    row.querySelector("span").textContent = label;
    row.querySelector("input").checked = opts[key];
    checks.append(row);
  }
  box.append(preview, checks);

  const show = (canvas) => {
    canvas.className = "plan-preview-pic";
    preview.replaceChildren(canvas);
  };
  show(first.canvas);
  checks.addEventListener("change", async (e) => {
    const key = e.target.dataset?.opt;
    if (!key) return;
    opts[key] = e.target.checked;
    show((await scenePlan(project, scene, loc, opts, { asBlob: false })).canvas);
  });

  const v = await formDialog("Camera plan", [{ name: "plan", type: "custom", element: box, read: () => ({ ...opts }) }], { ok: "Export PNG" });
  if (!v) return null;
  project.planOptions = v.plan;
  return scenePlan(project, scene, loc, v.plan);
}
