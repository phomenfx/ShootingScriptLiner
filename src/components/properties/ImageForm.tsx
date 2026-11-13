import * as commands from "../../commands";
import { imageSize, putAsset } from "../../lib/assetStore";
import { newId } from "../../lib/ids";
import * as edits from "../../model/edits";
import type { ImageMark, Project } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { Field, Footer, FooterButton, Group, NumberInput } from "./parts";

const apply = (edit: edits.Edit) => useProjectStore.getState().apply(edit);

/** An image on the script: its file, width (height follows), and replacing the picture. */
export function ImageInspector({ project, image }: { project: Project; image: ImageMark }) {
  const asset = project.assets.find((a) => a.id === image.assetId);
  const ratio = asset && asset.widthPx > 0 ? asset.heightPx / asset.widthPx : 1;
  const update = (patch: Partial<ImageMark>) => apply(edits.updateMark(image.id, (m) => (m.kind === "image" ? { ...m, ...patch } : m)));

  const replace = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,image/jpeg,image/png";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || (file.type !== "image/png" && file.type !== "image/jpeg")) return;
      const size = await imageSize(file);
      const id = newId();
      putAsset(id, file);
      breakUndoGroup();
      apply((p) =>
        edits.updateMark(image.id, (m) => (m.kind === "image" ? { ...m, assetId: id } : m))({
          ...p,
          assets: [...p.assets, { id, name: file.name, type: file.type as "image/png" | "image/jpeg", widthPx: size.width, heightPx: size.height }],
        })
      );
      breakUndoGroup();
    };
    input.click();
  };

  return (
    <>
      <div className="pf-scroll">
        <Group name="image-file" title="Image">
          <Field label="File" wide>
            <p className="pf-readonly">
              {asset?.name || "Image"}
              {asset ? ` · ${asset.widthPx} × ${asset.heightPx} px` : ""}
            </p>
          </Field>
          <Field label="Width">
            <NumberInput label="Image width" value={Math.round(image.widthPt)} min={8} unit="len" onChange={(widthPt) => widthPt && update({ widthPt })} />
          </Field>
          <Field label="Height">
            <p className="pf-readonly">{Math.round(image.widthPt * ratio)} pt</p>
          </Field>
          <div className="pf-wide">
            <FooterButton onClick={replace}>Replace picture…</FooterButton>
          </div>
        </Group>
      </div>
      <Footer>
        <FooterButton onClick={commands.duplicateSelection}>Duplicate</FooterButton>
        <FooterButton danger onClick={commands.deleteSelection}>
          Delete
        </FooterButton>
      </Footer>
    </>
  );
}
