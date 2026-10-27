import { z } from "zod";
import { EditPlan, Manifest, RecorderEvent, Transcript } from "./schema";

/**
 * JSON Schemas for the public file formats, so tools in any language can read and write Kadr bundles.
 * Schemas describe the parsed (input) shape, where defaulted fields are optional.
 */
export function toJsonSchemas() {
  const options = { io: "input" } as const;
  return {
    manifest: z.toJSONSchema(Manifest, options),
    event: z.toJSONSchema(RecorderEvent, options),
    transcript: z.toJSONSchema(Transcript, options),
    editPlan: z.toJSONSchema(EditPlan, options),
  };
}
