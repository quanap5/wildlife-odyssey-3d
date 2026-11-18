/**
 * Scientific inspection mode. The subject is rebuilt in its own small 3D scene
 * so it can be orbited and zoomed without freezing or altering the world. If
 * the species is not yet identified, only the model is shown.
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PHOTO } from '../../config';
import { isAnimal, requireSpecies, speciesText } from '../../data/species';
import { anatomyNotes } from '../../data/species/anatomy';
import { windUniforms } from '../../engine/rendering/windMaterial';
import type { Behavior } from '../../entities/wildlife/types';
import { useLang, useT, useTd } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { Panel } from '../menus/Panel';
import { animatePreview, createPreviewSubject, type PreviewSubject } from './modelPreview';

function Subject({ subject, behavior }: { subject: PreviewSubject; behavior: Behavior }): React.JSX.Element {
  const clock = useRef(0);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    clock.current += step;
    // The world is paused while inspecting, so this scene drives the wind itself.
    windUniforms.uTime.value += step;
    animatePreview(subject, behavior, clock.current, step);
  });
  return <primitive object={subject.object} />;
}

export function Inspection({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const inspect = useGame((s) => s.inspect);
  const discovered = useGame((s) => s.discovered);
  const openJournal = useGame((s) => s.openJournal);
  const species = useMemo(() => (inspect ? requireSpecies(inspect.speciesId) : null), [inspect]);
  const subject = useMemo(() => (species ? createPreviewSubject(species) : null), [species]);
  const [behavior, setBehavior] = useState<Behavior>('idle');

  useEffect(() => {
    if (!subject) return;
    const observed = inspect?.behavior as Behavior | undefined;
    setBehavior(observed && subject.animations.includes(observed) ? observed : (subject.animations[0] ?? 'idle'));
    return () => subject.dispose();
  }, [subject, inspect]);

  if (!species || !subject) return null;
  const record = discovered[species.id];
  const known = Boolean(record);
  const dist = subject.radius * 3.4;
  const adaptations = speciesText.adaptations(species, lang);
  const parts = anatomyNotes(species);

  return (
    <Panel title={t('inspect.title')} size="wide" onClose={onClose} testId="inspection" language bodyStyle={{ padding: 0, overflow: 'hidden' }}>
      <div className="inspect">
        <div className="inspect-view">
          <Canvas camera={{ fov: 32, near: Math.max(0.005, dist * 0.02), far: dist * 12, position: [dist * 0.75, subject.centerY + dist * 0.25, dist * 0.7] }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
            <ambientLight intensity={1.4} />
            <directionalLight position={[3, 5, 4]} intensity={3} color="#fff3dd" />
            {/* Rim light picks the subject out from the backdrop. */}
            <directionalLight position={[-4, 2, -4]} intensity={2.2} color="#bcd8ff" />
            <Subject subject={subject} behavior={behavior} />
            {/* Museum turntable: a plinth under the specimen and a slow turn until the player takes over. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002 * subject.radius, 0]}>
              <circleGeometry args={[subject.radius * 1.25, 48]} />
              <meshBasicMaterial color="#b9ad8c" transparent opacity={0.45} />
            </mesh>
            <OrbitControls target={[0, subject.centerY, 0]} enablePan={false} minDistance={subject.radius * 1.3} maxDistance={subject.radius * 8} autoRotate autoRotateSpeed={0.9} makeDefault />
          </Canvas>
          {subject.animations.length > 1 && (
            <div className="anim seg" data-testid="inspect-anims">
              {subject.animations.map((b) => (
                <button key={b} type="button" aria-pressed={behavior === b} onClick={() => setBehavior(b)}>
                  {td(`behavior.${b}`)}
                </button>
              ))}
            </div>
          )}
          <div className="hint-line">{t('inspect.hint')}</div>
        </div>
        <div className="inspect-side species-page" data-testid="inspect-side" data-known={known}>
          {known ? (
            <>
              <h3 data-testid="inspect-name">{speciesText.name(species, lang)}</h3>
              <p className="alt">{speciesText.altName(species, lang)}</p>
              <p className="sci">{species.scientificName}</p>
              <table className="data-table">
                <tbody>
                  <tr>
                    <th scope="row">{t('species.family')}</th>
                    <td>{species.family}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('species.order')}</th>
                    <td>{species.order}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('species.class')}</th>
                    <td>{species.className}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('species.habitat')}</th>
                    <td>{species.habitats.map((h) => td(`biome.${h}`)).join(' · ')}</td>
                  </tr>
                  {inspect?.behavior && (
                    <tr>
                      <th scope="row">{t('inspect.live')}</th>
                      <td>{td(`behavior.${inspect.behavior}`)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <h4>{t('species.description')}</h4>
              <p>{speciesText.description(species, lang)}</p>
              <h4>{t('inspect.hotspots')}</h4>
              <p className="locked-note" style={{ marginTop: 0 }}>{t('inspect.hotspotsNote')}</p>
              <ul data-testid="inspect-anatomy">
                {parts.map(({ part, note }) => (
                  <li key={part}>
                    <b>{td(part)}.</b> {td(note)}
                  </li>
                ))}
              </ul>
              {adaptations.length > 0 && (
                <>
                  <h4>{t('species.adaptations')}</h4>
                  <ul data-testid="inspect-adaptations">
                    {adaptations.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
              {isAnimal(species) && speciesText.behavior(species, lang) && (
                <>
                  <h4>{t('species.behavior')}</h4>
                  <p>{speciesText.behavior(species, lang)}</p>
                </>
              )}
              {(record?.bestQuality ?? 0) < PHOTO.highQuality && <p className="locked-note">{t('species.factsLocked', { n: PHOTO.highQuality })}</p>}
              <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => openJournal('encyclopedia', species.id)} data-testid="inspect-open-journal">
                {t('journal.title')}
              </button>
            </>
          ) : (
            <>
              <h3>{t('common.unknown')}</h3>
              <p className="locked-note">{t('inspect.unknownBody')}</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
