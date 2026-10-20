import { createEmptyProject, ProjectInput, ProjectModel } from './model';
import { Rig } from './Rig';

export function serializeProject(project: ProjectModel | Rig, pretty = false): string {
  const value = project instanceof Rig ? project.toProject() : project;
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Parses and normalizes project JSON, including the original minimal rig shape. */
export function deserializeProject(json: string): ProjectModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The project file is not valid JSON');
  }
  if (!isRecord(parsed)) throw new Error('The project file must contain a JSON object');
  if (parsed.schemaVersion !== undefined && typeof parsed.schemaVersion !== 'number') {
    throw new Error('The project schemaVersion must be a number');
  }
  return createEmptyProject(parsed as ProjectInput);
}

export function projectFromJSON(json: string): Rig {
  return Rig.fromProject(deserializeProject(json));
}

export const importProject = deserializeProject;
export const exportProject = serializeProject;

export function projectToJSON(project: ProjectModel | Rig, pretty = true): string {
  return serializeProject(project, pretty);
}

export function downloadTextFile(filename: string, contents: string, mimeType = 'application/json'): void {
  if (typeof document === 'undefined') throw new Error('File downloads require a browser environment');
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadProject(project: ProjectModel | Rig, filename = 'character-project.json'): void {
  downloadTextFile(filename, serializeProject(project, true));
}
