import React from 'react';
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import './style.css';

const fps = 30;
const durationInFrames = 1080;

const roster = [
  {name: '曾翊瑞', image: '曾翊瑞.png', tone: '#f2c84b'},
  {name: '林世傑', image: '林世傑.png', tone: '#24c3df'},
  {name: '梅子', image: '梅子.png', tone: '#ff7a59'},
  {name: '趙苡霖', image: '趙苡霖.png', tone: '#8ce99a'},
  {name: '曾宥翔', image: '曾宥翔.jpg', tone: '#b197fc'},
];

const beats = [
  {label: 'Technique', value: '精準入水'},
  {label: 'Rhythm', value: '穩定配速'},
  {label: 'Team', value: '一起變強'},
];

const results = [
  {event: '1500 Free', rank: '2nd', time: '17:36.41'},
  {event: '800 Free', rank: '3rd', time: '9:14.62'},
  {event: '100 Free', rank: '3rd', time: '1:00.85'},
];

const fit = (frame, start, end) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

const Waterlines = ({density = 8}) => {
  const frame = useCurrentFrame();
  return (
    <div className="waterlines" aria-hidden="true">
      {Array.from({length: density}).map((_, index) => {
        const drift = Math.sin((frame + index * 17) / 26) * 26;
        return (
          <div
            className="waterline"
            key={index}
            style={{
              top: `${10 + index * 11}%`,
              transform: `translateX(${drift}px)`,
              opacity: 0.14 + index * 0.018,
            }}
          />
        );
      })}
    </div>
  );
};

const TitleBlock = ({kicker, title, subtitle, align = 'left'}) => {
  const frame = useCurrentFrame();
  const {fps: videoFps} = useVideoConfig();
  const reveal = spring({frame, fps: videoFps, config: {damping: 22, stiffness: 90}});
  return (
    <div className={`titleBlock titleBlock-${align}`} style={{opacity: reveal}}>
      <div className="kicker">{kicker}</div>
      <h1 style={{transform: `translateY(${(1 - reveal) * 34}px)`}}>{title}</h1>
      <p style={{transform: `translateY(${(1 - reveal) * 22}px)`}}>{subtitle}</p>
    </div>
  );
};

const HeroScene = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 240], [1.08, 1], {extrapolateRight: 'clamp'});
  const groupIn = fit(frame, 16, 80);
  return (
    <AbsoluteFill className="scene heroScene">
      <Img
        className="heroPhoto"
        src={staticFile('東美合照.jpg')}
        style={{transform: `scale(${zoom})`}}
      />
      <div className="photoShade" />
      <Waterlines density={9} />
      <div className="brandLockup" style={{opacity: groupIn}}>
        <span>Dongmei Swim</span>
        <strong>東美泳隊</strong>
      </div>
      <TitleBlock
        kicker="2026 Team Film"
        title="把每一道水花練成速度"
        subtitle="從基本動作、配速節奏到比賽心態，一起把每天的訓練變成更靠近目標的距離。"
      />
    </AbsoluteFill>
  );
};

const TrainingScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="scene trainingScene">
      <Waterlines density={7} />
      <div className="splitImage">
        <Img src={staticFile('東美大頭.jpg')} />
      </div>
      <div className="trainingCopy">
        <TitleBlock
          kicker="Daily Work"
          title="專注、修正、再出發"
          subtitle="每一次划手都要有方向，每一次轉身都要更乾淨。速度不是突然出現，是被一趟一趟累積出來。"
        />
        <div className="beatGrid">
          {beats.map((beat, index) => {
            const appear = fit(frame, 84 + index * 14, 124 + index * 14);
            return (
              <div
                className="beatCard"
                key={beat.label}
                style={{
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 18}px)`,
                }}
              >
                <span>{beat.label}</span>
                <strong>{beat.value}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const RosterScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="scene rosterScene">
      <Waterlines density={10} />
      <div className="rosterHeader">
        <TitleBlock
          kicker="Roster"
          title="每個人都有自己的水道"
          subtitle="不同個性、不同項目，聚在同一個目標裡。"
          align="center"
        />
      </div>
      <div className="portraitTrack">
        {roster.map((member, index) => {
          const enter = fit(frame, index * 10, 56 + index * 10);
          const y = Math.sin((frame + index * 18) / 24) * 8;
          return (
            <div
              className="portraitCard"
              key={member.name}
              style={{
                '--tone': member.tone,
                opacity: enter,
                transform: `translateY(${(1 - enter) * 56 + y}px) rotate(${(index - 2) * 1.5}deg)`,
              }}
            >
              <Img src={staticFile(member.image)} />
              <span>{member.name}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ResultsScene = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + Math.sin(frame / 14) * 0.5;
  return (
    <AbsoluteFill className="scene resultsScene">
      <Waterlines density={8} />
      <div className="resultsCopy">
        <TitleBlock
          kicker="Race Proof"
          title="比賽日，把練習交出去"
          subtitle="成績不是句點，是下一輪訓練的起點。"
        />
      </div>
      <div className="resultsBoard">
        {results.map((result, index) => {
          const show = fit(frame, 44 + index * 18, 88 + index * 18);
          return (
            <div
              className="resultRow"
              key={result.event}
              style={{
                opacity: show,
                transform: `translateX(${(1 - show) * 60}px)`,
              }}
            >
              <span>{result.event}</span>
              <strong>{result.time}</strong>
              <em>{result.rank}</em>
            </div>
          );
        })}
      </div>
      <div className="medalGlow" style={{opacity: 0.24 + pulse * 0.16}} />
    </AbsoluteFill>
  );
};

const FinaleScene = () => {
  const frame = useCurrentFrame();
  const lift = fit(frame, 0, 76);
  const fade = interpolate(frame, [220, 285], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill className="scene finaleScene" style={{opacity: fade}}>
      <Img className="finalPhoto" src={staticFile('東美合照.jpg')} />
      <div className="finalShade" />
      <Waterlines density={9} />
      <div
        className="finalMessage"
        style={{transform: `translateY(${(1 - lift) * 46}px)`, opacity: lift}}
      >
        <span>Dongmei Swim Team</span>
        <strong>一起下水，一起前進</strong>
        <p>東美泳隊 | 2026</p>
      </div>
    </AbsoluteFill>
  );
};

export const DongmeiSwimVideo = () => {
  return (
    <AbsoluteFill className="videoRoot">
      <Sequence durationInFrames={240}>
        <HeroScene />
      </Sequence>
      <Sequence from={210} durationInFrames={270}>
        <TrainingScene />
      </Sequence>
      <Sequence from={450} durationInFrames={270}>
        <RosterScene />
      </Sequence>
      <Sequence from={690} durationInFrames={240}>
        <ResultsScene />
      </Sequence>
      <Sequence from={900} durationInFrames={180}>
        <FinaleScene />
      </Sequence>
    </AbsoluteFill>
  );
};

export const RemotionRoot = () => {
  return (
    <Composition
      component={DongmeiSwimVideo}
      defaultProps={{}}
      durationInFrames={durationInFrames}
      fps={fps}
      height={1080}
      id="DongmeiSwim"
      width={1920}
    />
  );
};
