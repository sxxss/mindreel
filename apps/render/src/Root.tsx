import { Composition } from "remotion";

import { RenderCompositionInputSchema } from "@auto/shared";

import { calculateKnowledgeVideoMetadata } from "./metadata.ts";
import { previewInput } from "./preview-input.ts";
import { KnowledgeVideo } from "./Video.tsx";

export const RemotionRoot = () => (
  <Composition
    id="KnowledgeVideo"
    component={KnowledgeVideo}
    defaultProps={previewInput}
    calculateMetadata={({ props }) =>
      calculateKnowledgeVideoMetadata(RenderCompositionInputSchema.parse(props))
    }
  />
);
