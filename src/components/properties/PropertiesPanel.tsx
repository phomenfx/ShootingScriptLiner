import { MultiShotInspector } from "./MultiShotForm";
import { captionFieldText } from "../../model/captions";
import * as edits from "../../model/edits";
import { useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";
import { LineInspector, OtherMarkInspector, TextInspector } from "./MarkForms";
import { ColorBar } from "./ColorBar";
import { ImageInspector } from "./ImageForm";
import { MultiMarkInspector } from "./MultiMarkForm";
import { ShapeInspector } from "./ShapeForm";
import { SceneInspector, ShotInspector } from "./ShotSceneForms";

const MARK_NAMES: Record<string, string> = { line: "Line", text: "Note", shape: "Shape", image: "Image" };

/** The color bar, then the form for whatever is selected. */
export function PropertiesPanel() {
  return (
    <div className="properties-panel">
      <ColorBar />
      <PropertiesBody />
    </div>
  );
}

/** Shows the form for whatever is selected: a line, a note, a shot or a scene. */
function PropertiesBody() {
  const project = useProjectStore((s) => s.project);
  const selection = useSessionStore((s) => s.selection);
  const markTab = useSessionStore((s) => s.markTab);
  const setMarkTab = useSessionStore((s) => s.setMarkTab);
  const id = selection?.ids[0];

  if (selection?.kind === "scene") {
    const scene = project.scenes.find((sc) => sc.id === id);
    if (scene) return <div className="pf" key={scene.id}><SceneInspector project={project} scene={scene} /></div>;
  }

  if (selection?.kind === "shot" && selection.ids.length > 1) {
    return (
      <div className="pf">
        <MultiShotInspector project={project} ids={selection.ids} />
      </div>
    );
  }

  if (selection?.kind === "shot") {
    const found = edits.findShot(project, id);
    if (found) return <div className="pf" key={found.shot.id}><ShotInspector project={project} found={found} asTab={false} /></div>;
  }

  // Several marks: what they are, and what can be done to all of them at once.
  if (selection?.kind === "mark" && selection.ids.length > 1) {
    return (
      <div className="pf">
        <MultiMarkInspector project={project} ids={selection.ids} />
      </div>
    );
  }

  if (selection?.kind === "mark") {
    const mark = edits.findMark(project, id);
    if (mark) {
      const linked = edits.findShot(project, edits.markShotId(mark));
      const showShot = !!linked && markTab === "shot";
      const own =
        mark.kind === "line" ? (
          <LineInspector project={project} line={mark} />
        ) : mark.kind === "text" ? (
          <TextInspector project={project} note={mark} />
        ) : mark.kind === "shape" ? (
          <ShapeInspector project={project} shape={mark} />
        ) : mark.kind === "image" ? (
          <ImageInspector project={project} image={mark} />
        ) : (
          <OtherMarkInspector mark={mark} />
        );
      return (
        <div className="pf" key={mark.id}>
          {/* A linked mark has two tabs: its own form and its shot's. */}
          {linked && (
            <div className="pf-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={!showShot} className={showShot ? undefined : "on"} onClick={() => setMarkTab("own")}>
                {MARK_NAMES[mark.kind]}
              </button>
              <button type="button" role="tab" aria-selected={showShot} className={showShot ? "on" : undefined} onClick={() => setMarkTab("shot")}>
                <span className="pf-tab-dot" style={{ background: linked.shot.color }} />
                Shot {captionFieldText(project, linked, "shotNumber")}
              </button>
            </div>
          )}
          {showShot && linked ? <ShotInspector project={project} found={linked} asTab markId={mark.id} mark={mark.kind === "line" || mark.kind === "text" ? mark : undefined} /> : own}
        </div>
      );
    }
  }

  return (
    <div className="pf">
      <div className="pf-scroll">
        {project.scenes.length === 0 ? (
          <ul className="pf-tips">
            <li>Import your script PDF from the File menu.</li>
            <li>Add a scene, then its shots, in the Scenes panel.</li>
            <li>Pick the Line tool and drag down the page to line a shot.</li>
            <li>Select a line here to link it to a shot.</li>
          </ul>
        ) : (
          <p className="pf-empty">Select a scene, a shot, a line or a note.</p>
        )}
      </div>
    </div>
  );
}
