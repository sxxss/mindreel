import type { SceneSpec, SceneSpecList } from "@auto/shared";

export const indexSceneSpecsById = (sceneSpecs: SceneSpecList) => {
  const byId = new Map<string, SceneSpec>();
  for (const spec of sceneSpecs) {
    if (byId.has(spec.sceneId)) {
      throw new Error(`Duplicate scene spec id ${spec.sceneId}`);
    }
    byId.set(spec.sceneId, spec);
  }
  return byId;
};
