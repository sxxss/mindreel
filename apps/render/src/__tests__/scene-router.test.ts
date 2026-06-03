import { describe, expect, test } from "vitest";

import { resolveSceneTemplate } from "../SceneRouter.tsx";
import { renderInput } from "./fixtures.ts";

describe("resolveSceneTemplate", () => {
  test("returns the registry definition and parsed props for a valid spec", () => {
    const resolved = resolveSceneTemplate(renderInput.sceneSpecs[0]!);

    expect(resolved.definition.id).toBe("TitleHook");
    expect(resolved.props.title).toBe("为什么要拆波");
  });

  test("throws when template props do not match the registry schema", () => {
    expect(() =>
      resolveSceneTemplate({
        ...renderInput.sceneSpecs[0]!,
        props: { title: "", subtitle: "bad", accents: [] },
      }),
    ).toThrow();
  });
});
