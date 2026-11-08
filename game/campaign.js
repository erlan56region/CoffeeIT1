/* Campaign content: 15 locations, 40 enemies, 8 friends and 3 weapons. */
(() => {
'use strict';
const GROUND_Y = 600, H = 720;
const ENEMIES = [
  ['Космический ворон','grabber',2,340,0,1],['Неоновый шершень','hunter',2,390,35,.75],
  ['Лунный комар','orbit',1,300,70,.65],['Астероидный краб','turret',4,0,110,1.05],
  ['Плазменный слизень','bomber',3,260,145,.9],['Кристальный шип','orbit',3,360,185,1],
  ['Пси-летучая мышь','swoop',3,420,220,.85],['Ледяной ворон','swoop',4,380,255,1.1],
  ['Кометный скат','hunter',3,440,285,1],['Ржавый дрон','turret',5,0,315,1.05],
  ['Лазерный глаз','turret',4,0,20,.8],['Фабричный жук','charger',4,430,50,.9],
  ['Ремонтный овод','bomber',3,320,90,.75],['Штурмовой ворон','swoop',5,450,130,1.15],
  ['Турбинный угорь','orbit',4,420,170,1],['Гравитационный призрак','hunter',4,400,200,1.05],
  ['Зеркальный двойник','charger',5,470,235,1.1],['Ионный еж','turret',5,0,265,.95],
  ['Квантовый паук','orbit',4,460,300,.85],['Пустотный пес','hunter',6,480,330,1.15],
  ['Когнитивный клещ','swoop',5,460,15,.9],['Страж цитадели','turret',7,0,60,1.25],
  ['Элитный пси-ворон','grabber',7,500,105,1.3],['Хаос-инкубатор','bomber',8,380,160,1.35],
  ['Бешеный пёс Фифи','charger',4,510,330,1],['Злой кот','bomber',8,290,15,1.2],
  ['Адвокат Хека','turret',5,0,45,1],['Теневой демон','hunter',5,440,280,1.05],
  ['Профессор Мартышкоголов','turret',7,0,110,1.2],['Майор Сопля','bomber',6,330,90,1.15],
  ['Док Дуоденум','healer',7,260,160,1.1],['Золотая рыбка Боб','orbit',5,390,50,.8],
  ['Хенчкрыса','thief',4,470,20,.95],['Адский снеговик','splitter',6,350,190,1.15],
  ['Клешня-юрист','shield',9,300,35,1.25],['Пси-стервятник','grabber',6,490,225,1.1],
  ['Педро Пупа','leaper',5,440,25,1],['Огненный Зев','bomber',8,350,5,1.25],
  ['Злой Джим','charger',8,520,130,1.2],['Королевский слизень','healer',10,270,75,1.35]
].map(([name,behavior,hp,speed,hue,scale],id)=>({id,name,behavior,hp,speed,hue,scale}));

const FRIENDS = [
  {name:'Профессор Мотылёк',bonus:'ammo',color:'#ffe14a',message:'Держи плазму! Q / E — смена оружия.'},
  {name:'Питер Паппи',bonus:'heal',color:'#ff9fc6',message:'Не бойся, я почти спокоен! +50 здоровья.'},
  {name:'Корова МУ-7',bonus:'score',color:'#ffffff',message:'МУ-У! +1000 очков.'},
  {name:'Робот Снотт',bonus:'spread',color:'#7ff6ff',message:'Разблокирован тройной импульс!'},
  {name:'Капитан Груви',bonus:'life',color:'#b6ff4a',message:'За героев! +1 жизнь.'},
  {name:'Инженер Луна',bonus:'rail',color:'#d8a0ff',message:'Рельсотрон готов. Выбери его клавишей 3.'},
  {name:'Хомяк Турбо',bonus:'speed',color:'#ff9b52',message:'На гонке держи → для ускорения!'},
  {name:'Принцесса-голограмма',bonus:'checkpoint',color:'#ff7eb6',message:'Прогресс сохранён. Доберись до маяка!'}
].map((friend,id)=>({...friend,id}));

const WEAPONS = [
  {name:'ПЛАЗМА',cost:1,cooldown:.14,speed:1250,damage:1,color:'#67f3ff',count:1,spread:0},
  {name:'ИМПУЛЬС ×3',cost:2,cooldown:.25,speed:1100,damage:1,color:'#d8ff3e',count:3,spread:.17},
  {name:'РЕЛЬСОТРОН',cost:4,cooldown:.48,speed:1850,damage:4,color:'#e69cff',count:1,spread:0,pierce:true}
];

const STAGES = [
  {name:'НОВЫЙ МУСОРНЫЙ ГОРОД',short:'МУСОРНЫЙ ГОРОД',theme:'city',mechanic:'belts',color:'#ff9b52',worldW:7000,puzzle:'switches',required:2,enemies:[0,24,35],friends:[0,1],objective:'Активируй 2 рубильника и открой шлюз.'},
  {name:'НЕОНОВАЯ ЛАБОРАТОРИЯ',short:'НЕОНОВАЯ ЛАБ',theme:'lab',mechanic:'lasers',color:'#7ff6ff',worldW:7200,puzzle:'keys',required:2,enemies:[3,26,28],friends:[3],objective:'Найди 2 ключ-карты. Они спрятаны на платформах.'},
  {name:'ПЕЩЕРЫ АСТЕРОИДА X',short:'ПЕЩЕРЫ X',theme:'cave',mechanic:'moon',color:'#d8a0ff',worldW:7400,puzzle:'sequence',required:3,enemies:[5,27,29],friends:[2],objective:'Включи терминалы строго в порядке 1 → 2 → 3.'},
  {name:'КРИСТАЛЬНЫЕ САДЫ',short:'КРИСТАЛЬНЫЕ САДЫ',theme:'garden',mechanic:'springs',color:'#b6ff4a',worldW:7600,puzzle:'switches',required:4,enemies:[7,31,36],friends:[4],objective:'Разбуди 4 цветка-антенны. Хлыст тоже их активирует.'},
  {name:'ГОНКА: КОЛЬЦО САТУРНА',short:'КОСМИЧЕСКАЯ ГОНКА',theme:'race',mechanic:'race',color:'#ffe14a',worldW:10000,puzzle:'race',required:0,enemies:[],friends:[6],race:true,objective:'Скутер: ↑ ↓ — манёвр, → — ускорение. Финиш 10 км.'},
  {name:'ЛЕДЯНАЯ КОМЕТА',short:'ЛЕДЯНАЯ КОМЕТА',theme:'ice',mechanic:'ice',color:'#a8eaff',worldW:7800,puzzle:'keys',required:3,enemies:[7,8,33],friends:[5],objective:'Собери 3 ледяных ядра и не свались в трещины.'},
  {name:'ПЛАЗМЕННАЯ ФАБРИКА',short:'ФАБРИКА',theme:'factory',mechanic:'vents',color:'#ff655f',worldW:8000,puzzle:'sequence',required:4,enemies:[10,25,37],friends:[0],objective:'Перезапусти реактор: терминалы 1 → 2 → 3 → 4.'},
  {name:'АРМАДА ПСИ-ВОРОНОВ',short:'АРМАДА',theme:'armada',mechanic:'wind',color:'#ff9fc6',worldW:8300,puzzle:'switches',required:5,enemies:[13,14,32,35],friends:[7],objective:'Отключи 5 маяков наводки на разных высотах.'},
  {name:'ЛАБИРИНТ РАЗУМА',short:'ЛАБИРИНТ',theme:'maze',mechanic:'mirror',color:'#b49cff',worldW:8600,puzzle:'sequence',required:4,keys:3,enemies:[15,18,30,38],friends:[2,5],objective:'Собери 3 фрагмента и реши последовательность 2 → 4 → 1 → 3.'},
  {name:'ТОКСИЧНАЯ КАНАЛИЗАЦИЯ',short:'КАНАЛИЗАЦИЯ',theme:'sewer',mechanic:'poison',color:'#9cff38',worldW:8800,puzzle:'switches',required:5,keys:2,enemies:[4,29,32,39],friends:[1],objective:'Осуши токсичные резервуары: 2 ключа и 5 клапанов.'},
  {name:'ЛАВОВЫЙ РЕАКТОР',short:'ЛАВОВЫЙ РЕАКТОР',theme:'volcano',mechanic:'lava',color:'#ff5a28',worldW:9100,puzzle:'keys',required:4,enemies:[17,25,33,37],friends:[4],objective:'Найди 4 охлаждающих ядра среди движущихся платформ.'},
  {name:'ЧАСОВОЙ МЕХАНИЗМ',short:'ЧАСОВОЙ МЕХАНИЗМ',theme:'clockwork',mechanic:'crushers',color:'#ffd27a',worldW:9400,puzzle:'sequence',required:6,keys:1,sequence:[2,6,1,5,3,4],enemies:[9,21,26,34,36],friends:[0],objective:'Заведи механизм: 2 → 6 → 1 → 5 → 3 → 4 и возьми ключ.'},
  {name:'ОРБИТАЛЬНОЕ КЛАДБИЩЕ',short:'ОРБИТАЛЬНОЕ КЛАДБИЩЕ',theme:'graveyard',mechanic:'darkness',color:'#a7b3c9',worldW:9700,puzzle:'switches',required:6,keys:3,enemies:[2,27,30,31,33],friends:[2,7],objective:'Найди 3 сигнальных ключа и подай 6 сигналов SOS.'},
  {name:'НУЛЕВОЕ ПРОСТРАНСТВО',short:'НУЛЕВОЕ ПРОСТРАНСТВО',theme:'void',mechanic:'portals',color:'#df70ff',worldW:10000,puzzle:'sequence',required:5,keys:4,sequence:[3,1,5,2,4],enemies:[16,19,34,35,38],friends:[5],objective:'4 фрагмента и порталы: 3 → 1 → 5 → 2 → 4. Хлыст — Z.'},
  {name:'ПСИ-ЦИТАДЕЛЬ',short:'ЦИТАДЕЛЬ',theme:'citadel',mechanic:'boss',color:'#ff4a4a',worldW:10500,puzzle:'boss',required:0,enemies:[20,22,28,34,39],friends:[7],objective:'Пробейся к Пси-Вороне и спаси принцессу.'}
];

function rng(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
function build(stageIndex){
  const cfg=STAGES[stageIndex], r=rng(400+stageIndex*71), plats=[], crows=[], items=[], cows=[], signs=[], switches=[], friends=[], mechanics=[];
  let seed=stageIndex*100+7;
  const G=(x,w)=>plats.push({x,y:GROUND_Y,w,h:H-GROUND_Y+20,ground:true,seed:seed++});
  const P=(x,y,w,moving=false)=>plats.push({x,y,w,h:30,seed:seed++,...(moving?{ox:x,range:45+r()*65,speed:.7+r(),phase:r()*6}:{})});
  const gaps=[];
  for(let x=1350;x<cfg.worldW-700;x+=1050){
    const width=150+Math.floor(r()*85); gaps.push([x,width]);
  }
  let cursor=0;
  for(const [gap,width] of gaps){G(cursor,gap-cursor);cursor=gap+width;}
  G(cursor,cfg.worldW-cursor);
  // Every gap has a readable but demanding route; later stages add vertical detours.
  gaps.forEach(([x,w],i)=>{
    P(x-80,GROUND_Y-125-(i%2)*55,120);
    P(x+w-35,GROUND_Y-190+(i%3)*35,125,stageIndex>1&&i%2===0);
    if(stageIndex>3)P(x+20,GROUND_Y-300,110,true);
  });
  for(let x=480,i=0;x<cfg.worldW-650;x+=430,i++){
    const y=GROUND_Y-115-(i%3)*70-(stageIndex>5&&i%4===0?60:0);
    P(x,y,150+(i%2)*35,stageIndex>0&&i%5===3);
    if(i%2===0)items.push({type:i%6===4?'heart':'atom',x:x+70,y:y-45,t:r()*6});
  }
  const doorX=cfg.worldW-520;
  const switchCount=cfg.puzzle==='switches'||cfg.puzzle==='sequence'?cfg.required:0;
  const sequence=cfg.sequence||(stageIndex===8?[2,4,1,3]:Array.from({length:switchCount},(_,i)=>i+1));
  if(cfg.puzzle==='sequence') signs.push({x:1100,text:`ГОЛОВОЛОМКА: бей терминалы хлыстом (Z): ${sequence.join(' → ')}`});
  for(let i=0;i<switchCount;i++){
    const x=1450+i*(Math.max(900,(doorX-1900)/Math.max(1,switchCount-1)));
    switches.push({x,y:GROUND_Y-72,order:sequence[i],active:false,lockedFlash:0});
  }
  const keyCount=cfg.keys||(cfg.puzzle==='keys'?cfg.required:0);
  for(let i=0;i<keyCount;i++)items.push({type:'key',x:1800+i*1450,y:GROUND_Y-240-(i%2)*90,t:r()*6});
  cfg.enemies.forEach((typeId,group)=>{
    const count=2+(stageIndex>4?1:0);
    for(let i=0;i<count;i++){
      const x=1050+group*1450+i*570+r()*180,y=180+r()*230;
      const type=ENEMIES[typeId];
      crows.push({x,y,bx:x,by:y,w:90*type.scale,h:52*type.scale,hp:type.hp,maxHp:type.hp,t:r()*6,state:'patrol',st:r(),vx:0,vy:0,flash:0,face:-1,dead:false,typeId,attackT:1+r()*2,grabMode:null,grabT:0,grabCooldown:0,grabSide:(i+group)%2});
    }
  });
  cfg.friends.forEach((id,i)=>friends.push({id,x:850+i*2800,y:GROUND_Y-85,t:r()*6,met:false}));
  [2100,4200,cfg.worldW-1100].forEach(x=>signs.push({x,active:false}));
  [[1250,230],[cfg.worldW-1600,180]].forEach(([x,y])=>cows.push({x,y,w:100,h:82,t:r()*6,launched:false,vy:0,rot:0}));
  if(cfg.mechanic==='lasers') for(let x=1700;x<cfg.worldW-800;x+=1450) mechanics.push({kind:'laser',x,phase:r()*6});
  if(cfg.mechanic==='vents'||cfg.mechanic==='lava') for(let x=1250;x<cfg.worldW-700;x+=1250) mechanics.push({kind:cfg.mechanic,x,phase:r()*6});
  if(cfg.mechanic==='crushers') for(let x=1800;x<cfg.worldW-800;x+=1700) mechanics.push({kind:'crusher',x,phase:r()*6});
  if(cfg.mechanic==='poison') gaps.forEach(([x,w])=>mechanics.push({kind:'poison',x,w}));
  if(cfg.mechanic==='portals') mechanics.push({kind:'portal',x:2300,pair:1},{kind:'portal',x:6800,pair:0});
  return {cfg,plats,crows,items,cows,signs,switches,friends,mechanics,portalCooldown:0,doors:[{x:doorX,y:GROUND_Y-240,w:45,h:240}],exitX:cfg.worldW-170,keyCount,keysFound:0,sequenceOrder:sequence,sequencePos:0};
}
window.Campaign={ENEMIES,FRIENDS,WEAPONS,STAGES,build};
})();
