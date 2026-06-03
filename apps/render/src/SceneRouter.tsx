import { SceneFrame, templateRegistry } from "@auto/scenes";
import type { SceneSpec } from "@auto/shared";

export const resolveSceneTemplate = (spec: SceneSpec) => {
  const definition = templateRegistry[spec.templateId];
  const props = definition.propsSchema.parse(spec.props);
  return { definition, props };
};

export const SceneRouter = ({
  spec,
  durationInFrames,
  stepStartsMs,
  themeId,
}: {
  spec: SceneSpec;
  durationInFrames?: number;
  stepStartsMs?: number[];
  themeId?: string;
}) => {
  const { definition, props } = resolveSceneTemplate(spec);
  return (
    <SceneFrame
      definition={definition}
      props={props}
      {...(durationInFrames === undefined ? {} : { durationInFrames })}
      {...(stepStartsMs === undefined ? {} : { stepStartsMs })}
      {...(themeId === undefined ? {} : { themeId })}
    />
  );
};
