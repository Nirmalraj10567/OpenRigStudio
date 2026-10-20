import { addCharacterViewSet } from './characterViews';
import { addMeshDynamics, invalidateDynamics } from './dynamics';
import { Rig } from './Rig';
import type { ProjectModel } from './model';

export interface CharacterImportSummary {
  prepared: boolean;
  viewSetId: string | null;
  viewCount: number;
  meshLayerIds: string[];
  weightedLayerIds: string[];
  clothIds: string[];
  rootId: string | null;
}

const CLOTHING = /shirt|sleeve|collar|pants|shoe|dress|skirt|jacket|hoodie|blouse|top|clothing/i;
const OUTLINE = /outline|shadow|ground/i;
const HUMANOID_BONE = /torso|spine|neck|head|arm|hand|leg|foot|hip|pelvis/i;

function isCharacterProject(project: ProjectModel): boolean {
  const humanoidBones = project.bones.some(bone => HUMANOID_BONE.test(bone.name));
  const vectorArtwork = project.layers.some(layer => layer.type === 'vector');
  return humanoidBones && vectorArtwork;
}

function clothingGrid(name: string): { columns: number; rows: number } {
  if (/shoe/i.test(name)) return { columns: 3, rows: 2 };
  if (/sleeve|arm|leg|pants/i.test(name)) return { columns: 3, rows: 6 };
  if (/shirt|jacket|hoodie|blouse|dress|skirt|top/i.test(name)) return { columns: 5, rows: 6 };
  return { columns: 3, rows: 4 };
}

function clothingBones(rig: Rig, layerId: string): string[] {
  const layer = rig.layers.get(layerId);
  if (!layer?.boundBoneId) return [];
  const result = new Set<string>([layer.boundBoneId]);
  const bone = rig.bones.get(layer.boundBoneId);
  if (!bone) return [];
  // Include the adjacent joint so a sleeve or trouser leg can bend instead of
  // behaving like a rigid sticker. The actual LBS solver limits this to four
  // nearest influences per vertex.
  if (bone.parentId && rig.bones.has(bone.parentId)) result.add(bone.parentId);
  rig.getChildren(bone.id).slice(0, 2).forEach(child => result.add(child.id));
  return [...result];
}

/**
 * Converts the supplied boy walk file into a first-class editable character
 * studio import. Existing authored angle artwork and animation are retained;
 * only missing clothing meshes, skin weights and cloth objects are added.
 */
export function prepareCharacterStudioImport(input: ProjectModel): { project: ProjectModel; summary: CharacterImportSummary } {
  const empty: CharacterImportSummary = {
    prepared: false, viewSetId: input.characterViews?.[0]?.id ?? null,
    viewCount: input.characterViews?.[0]?.views.length ?? 0, meshLayerIds: [],
    weightedLayerIds: [], clothIds: [], rootId: input.bones.find(bone => !bone.parentId)?.id ?? null,
  };
  if (!isCharacterProject(input)) return { project: input, summary: empty };

  const rig = new Rig(input);
  const viewSet = rig.characterViews[0] ?? null;
  let viewSetId: string | null = viewSet?.id ?? null;
  if (!viewSet) {
    const createdViewSetId = addCharacterViewSet(rig, `${rig.name} · multi-angle`, [...rig.bones.keys(), ...rig.layers.keys()]);
    viewSetId = createdViewSetId ?? null;
  }

  const meshLayerIds: string[] = [];
  const weightedLayerIds: string[] = [];
  const clothIds: string[] = [];
  for (const layer of [...rig.layers.values()]) {
    if (layer.type !== 'vector' || !CLOTHING.test(layer.name) || OUTLINE.test(layer.name)) continue;
    if (!layer.mesh && rig.createMesh(layer.id, clothingGrid(layer.name).columns, clothingGrid(layer.name).rows)) meshLayerIds.push(layer.id);
    if (!layer.mesh) continue;
    const candidates = clothingBones(rig, layer.id);
    if (candidates.length && !layer.mesh.bindBoneInverses && rig.bindMesh(layer.id, candidates)) weightedLayerIds.push(layer.id);
    if (!rig.dynamics.meshes.some(item => item.layerId === layer.id)) {
      const id = addMeshDynamics(rig, layer.id, 'cloth');
      const cloth = id && rig.dynamics.meshes.find(item => item.id === id);
      if (cloth) {
        cloth.poseFollow = .88;
        cloth.maxDisplacement = 10;
        cloth.adaptiveRest = true;
        cloth.gravityScale = .35;
        cloth.windScale = .55;
        clothIds.push(id);
      }
    }
  }

  if (meshLayerIds.length || weightedLayerIds.length || clothIds.length) {
    rig.dynamics.enabled = true;
    rig.metadata = {
      ...rig.metadata,
      characterStudioImport: 'prepared-v1',
      riggingToolkit: 'human-bone-ik-bind-v1',
      weightPainting: 'vertex-brush-v1',
      clothingPhysics: 'cloth-mesh-v1',
    };
    invalidateDynamics(rig);
  }
  rig.update();
  const project = rig.toProject();
  const preparedSet = project.characterViews?.find(set => set.id === viewSetId);
  return {
    project,
    summary: {
      prepared: Boolean(meshLayerIds.length || weightedLayerIds.length || clothIds.length),
      viewSetId,
      viewCount: preparedSet?.views.length ?? 0,
      meshLayerIds,
      weightedLayerIds,
      clothIds,
      rootId: project.bones.find(bone => !bone.parentId)?.id ?? null,
    },
  };
}
