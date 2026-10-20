import { T, mix, smooth, limbIK } from './drawing.mjs';
import { LIMBS } from './actor.mjs';

export const ACTIONS = ['walk', 'inspect', 'wave', 'stumble', 'idle'];

export function animateActor(project, recipe) {
  const duration = recipe.duration, fps = recipe.fps, total = duration*fps;
  const actions = recipe.actions;
  const walkPart = actions.includes('walk') ? .46 : 0;
  const falling = actions.includes('stumble');
  const initialX = 556, floor = 625, scale = .90;
  const tracks = new Map();
  const key = (targetId, property, frame, value) => {
    const id = `${targetId}:${property}`;
    if (!tracks.has(id)) tracks.set(id,{ id:`kit-${id}`,targetId,property,keyframes:[] });
    tracks.get(id).keyframes.push({id:`${id}:${frame}`,frame,value,easing:'linear'});
  };
  let reachClamps = 0;
  for (let frame=0;frame<=total;frame++) {
    const t = frame/fps, progress=t/duration;
    const walkTime=duration*walkPart, travel=walkTime ? 107 : 0;
    const inWalk=walkTime>0 && t<walkTime;
    const travelT=walkTime ? Math.min(t/walkTime,1) : 0;
    const settle=walkTime ? (inWalk ? 1 : 1-smooth((t-walkTime)/.20)) : 0;
    const stumble=falling ? smooth((progress-.62)/.19) : 0;
    const land=falling ? smooth((progress-.81)/.09) : 0;
    const tilt=stumble*Math.PI/2;
    const hipY=floor-122*scale;
    const hipX=mix(initialX+travel*travelT,554,stumble);
    const hip= T(hipX, mix(hipY,589,stumble)+Math.sin(land*Math.PI)*7,tilt,scale);
    const cycle=.86, speed=walkTime ? travel/walkTime : 0;
    key('actor','transform',frame,hip);
    key('torso','rotation',frame,inWalk ? Math.sin(t*Math.PI*2/cycle)*.015 : -Math.sin(stumble*Math.PI)*.07);
    key('head','rotation',frame,-tilt + (actions.includes('inspect') && !inWalk ? -.07*Math.sin(progress*7) : .03*Math.sin(t*3)));
    const zoom=recipe.camera==='follow' ? 1+smooth((progress-.46)/.47)*.38 : 1;
    // Keep the actor/fall focal point stable while the room pushes in.
    key('shot','transform',frame,T(-560*(zoom-1),-540*(zoom-1),0,zoom));
    key('actor-contact-shadow','transform',frame,T(hipX+stumble*38,floor+5,0,scale*(1+stumble*.62)));
    for (const [index,limb] of LIMBS.entries()) {
      const leg=limb.role.endsWith('leg'), side=index%2;
      const phase=((Math.min(t,walkTime)/cycle)+(side?.5:0))%1;
      let tx,ty;
      if (leg) {
        const stride=speed*cycle*.62/scale;
        const footX=phase<.62 ? stride*(.5-phase/.62) : mix(-stride/2,stride/2,smooth((phase-.62)/.38));
        const lift=phase<.62 ? 0 : Math.sin(Math.PI*(phase-.62)/.38)*14;
        tx=mix(footX*settle,28-limb.socket[0],stumble);
        ty=mix(118-lift*settle,side?99:90,stumble);
      } else {
        const swing=Math.sin(t*Math.PI*2/cycle+(side?Math.PI:0))*17*settle;
        tx=side ? 15+swing : -7+swing;
        ty=59;
        if (actions.includes('inspect') && !inWalk) {
          const amount=smooth((progress-.46)/.07)*(1-stumble);
          tx=mix(tx,side?35:24,amount); ty=mix(ty,side?-9:5,amount);
        }
        if (actions.includes('wave') && side===1 && !inWalk) {
          tx=31+Math.sin(t*12)*7;ty=-45;
        }
        // Palms land together under the head, elbow solves between its two
        // fixed-length pieces instead of moving either piece independently.
        tx=mix(tx,(side?27:28)-limb.socket[0],stumble);
        ty=mix(ty,(side?-113:-102)-limb.socket[1],stumble);
      }
      const solved=limbIK(tx,ty,limb.upper,limb.lower,limb.bend);
      if (solved.clamped) reachClamps++;
      key(`${limb.role}-upper`,'rotation',frame,solved.upper);
      key(`${limb.role}-lower`,'rotation',frame,solved.lower);
      const tipAngle=leg ? -tilt-solved.upper-solved.lower+stumble*.1 : -tilt-solved.upper-solved.lower+stumble*(-.1);
      key(`${limb.role}-tip`,'rotation',frame,tipAngle);
    }
    key('landing-dust','transform',frame,T(655,632,0,.5+land*.8));
    key('landing-dust','opacity',frame,falling ? Math.sin(land*Math.PI)*.55 : 0);
  }
  // Set authored frame zero as well, so Open displays the same pose as Play.
  for (const track of tracks.values()) {
    const target=[...project.bones,...project.layers].find(item=>item.id===track.targetId);
    const value=track.keyframes[0].value;
    if (track.property==='transform') target.local=structuredClone(value);
    else if (track.property==='rotation') target.local.rotation=value;
    else if (track.property==='opacity') target.opacity=value;
  }
  const clip={id:'scene-kit-animation',name:actions.join(' → '),fps,startFrame:0,endFrame:total,loopMode:'once',tracks:[...tracks.values()],setupPose:Object.fromEntries([...project.bones,...project.layers].map(item=>[item.id,{local:structuredClone(item.local),...(item.type?{opacity:item.opacity,visible:item.visible}:{})}]))};
  project.animations=[clip];
  project.timeline={currentFrame:0,currentTime:0,isPlaying:false,loop:false,fps,startFrame:0,endFrame:total,activeAnimationId:clip.id};
  return {reachClamps};
}
