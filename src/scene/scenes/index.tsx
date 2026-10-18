import { SceneGroup } from '../hooks'
import { Hero } from './Hero'
import { Driveway } from './Driveway'
import { Basement } from './Basement'
import { Van } from './Van'
import { Storm } from './Storm'
import { Quiet } from './Quiet'
import { Sunset } from './Sunset'
import { Cloud } from './Cloud'
import { Gym } from './Gym'
import { Partners } from './Partners'
import { Foot } from './Foot'
import { Flow } from './Flow'
import { Timeline } from './Timeline'
import { Now } from './Now'

/**
 * One <SceneGroup> per chapter, in story order (index must match core/grade.ts + content/story.ts).
 * To revise a section's 3D, edit only its own file in this folder.
 */
export function Scenes() {
  return (
    <>
      <SceneGroup index={0}><Hero /></SceneGroup>
      <SceneGroup index={1}><Driveway /></SceneGroup>
      <SceneGroup index={2}><Basement /></SceneGroup>
      <SceneGroup index={3}><Van /></SceneGroup>
      <SceneGroup index={4}><Storm /></SceneGroup>
      <SceneGroup index={5}><Quiet /></SceneGroup>
      <SceneGroup index={6}><Sunset /></SceneGroup>
      <SceneGroup index={7}><Cloud /></SceneGroup>
      <SceneGroup index={8}><Gym /></SceneGroup>
      <SceneGroup index={9}><Partners /></SceneGroup>
      <SceneGroup index={10}><Foot /></SceneGroup>
      <SceneGroup index={11}><Flow /></SceneGroup>
      <SceneGroup index={12}><Timeline /></SceneGroup>
      <SceneGroup index={13}><Now /></SceneGroup>
    </>
  )
}
