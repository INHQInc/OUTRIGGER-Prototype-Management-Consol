import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { featuresRoot } from "../features/registry";

/** Remembered handoff target choices, per feature: selector -> chosen source file. */
interface HandoffChoices {
  targets: Record<string, string>;
}

function file(key: string): string {
  return join(featuresRoot(), key, "handoff.json");
}

export async function getChoices(key: string): Promise<HandoffChoices> {
  try {
    return JSON.parse(await readFile(file(key), "utf8")) as HandoffChoices;
  } catch {
    return { targets: {} };
  }
}

export async function setChoice(key: string, selector: string, targetFile: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return;
  const choices = await getChoices(key);
  choices.targets[selector] = targetFile;
  await writeFile(file(key), JSON.stringify(choices, null, 2) + "\n", "utf8");
}
