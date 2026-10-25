const UP='#E5484D', DOWN='#2F9E63';
const THEME_KEY='candle-theme';
function loadTheme(){try{return localStorage.getItem(THEME_KEY)}catch(e){return null}}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  const lb=document.getElementById('themeLabel');
  if(lb)lb.textContent=(t==='dark'?'浅色':'深色');
  try{localStorage.setItem(THEME_KEY,t)}catch(e){}
}
applyTheme(loadTheme()==='dark'?'dark':'light');
const CHAPTERS=[
  {id:'ch01',num:'第一章',name:'引论',en:'Introduction',note:'先理解蜡烛图能提供什么、怎样与其他分析工具配合，以及为什么单根形态不能脱离趋势与收市确认。',unit:'个知识点'},
  {id:'ch02',num:'第二章',name:'历史背景',en:'Historical Background',note:'沿着日本商业发展、大阪堂岛米市与本间宗久的故事，了解早期价格观察方法的历史环境。',unit:'个知识点'},
  {id:'ch03',num:'第三章',name:'蜡烛图的绘制方法',en:'Constructing Candlesticks',note:'从同一组开高低收数据出发，读懂实体、影线、纺锤线与十字线，并注意时间周期和未收市线的限制。',unit:'个知识点'},
  {id:'ch04',num:'第四章',name:'反转形态',en:'Reversal Patterns',note:'较强烈的反转信号：锤子线 / 上吊线（伞形线）、吞没（抱线）、乌云盖顶、刺透。'},
  {id:'ch05',num:'第五章',name:'星线',en:'Star Patterns',note:'以“星线”（小实体+与前实体跳空）为共同特征的反转形态。'},
  {id:'ch06',num:'第六章',name:'其他反转形态',en:'Other Reversal Patterns',note:'孕线、平头、捉腰带、乌鸦、三兵、三山三川、反击、圆形与塔形顶底等。'},
  {id:'ch07',num:'第七章',name:'持续形态',en:'Continuation Patterns',note:'形态完成后趋势延续：窗口、并列阴阳线、三法、分手线等。'},
  {id:'ch08',num:'第八章',name:'神奇的十字线',en:'The Doji',note:'十字线家族：北方/南方十字线、长腿、墓碑、蜻蜓、大风大浪线与三星形态。'},
  {id:'ch09',num:'第九章',name:'蜡烛图技术汇总',en:'Summary',note:'以债券期货综合图例逐点解读，演示如何把全部蜡烛图工具放进总体技术环境中综合判断。'},
  {id:'ch10',num:'第十章',name:'蜡烛图信号的汇聚',en:'Signal Convergence',note:'一群蜡烛图信号汇聚在同一价格区，将放大该区域作为支撑或阻挡的重要性。'},
  {id:'ch11',num:'第十一章',name:'蜡烛图与趋势线',en:'Candlesticks & Trend Lines',note:'趋势线的类型与画法、破低反涨/破高反跌形态、极性转换原则。'},
  {id:'ch12',num:'第十二章',name:'蜡烛图与百分比回撤',en:'Candlesticks & Retracements',note:'38% / 50% / 62% 斐波那契回撤水平，以及回撤位必须得到蜡烛图信号验证。'},
  {id:'ch13',num:'第十三章',name:'蜡烛图与移动平均线',en:'Candlesticks & Moving Averages',note:'简单/加权/指数加权移动平均线，黄金交叉与死亡交叉，均线作支撑或阻挡。'},
  {id:'ch14',num:'第十四章',name:'蜡烛图与摆动指数',en:'Candlesticks & Oscillators',note:'RSI、移动平均线摆动指数、随机指数、MACD；超买超卖与相互背离。'},
  {id:'ch15',num:'第十五章',name:'蜡烛图与交易量',en:'Candlesticks & Volume',note:'交易量验证蜡烛图信号：放量锤子线/十字线/纺锤线、形态量能分布、突破验证。'},
  {id:'ch16',num:'第十六章',name:'测算价格目标',en:'Price Targets',note:'箱体突破、对等运动、旗形与尖旗形、上升/下降三角形的价格目标测算。'},
  {id:'ch17',num:'第十七章',name:'东西方技术相互验证',en:'Confluence',note:'纳斯达克综合指数案例：东方形态与西方工具汇聚于同一区域，预测主要顶部。'},
  {id:'gA',num:'术语表A',name:'蜡烛图技术术语',en:'Glossary A: Candlestick Terms',note:'书中蜡烛图术语小词典：待入线/切入线/插入线、前方受阻、纺锤线、光脚光头、伞形线等。'},
  {id:'gB',num:'术语表B',name:'西方技术分析术语',en:'Glossary B: Western Terms',note:'书中西方技术分析术语：趋势线、支撑与阻挡、突破跳空、岛形、颈线、摆动指数等。'}
];
let PATTERNS=[];
const CHAPTER_GUIDES={
  ch01:[
    {title:'蜡烛图多表达了什么',body:'蜡烛图与线图使用同一组开市、最高、最低、收市数据。实体把开市到收市的方向和幅度放在一起，影线补充该时段触及的高低点，因此更容易观察买卖力量在一个周期内如何变化。'},
    {title:'它适合怎样使用',body:'蜡烛图容易读，也常能比只看收市价的图表更早显示市场动能减弱或情绪转变。它还能与趋势线、移动平均线、回撤水平等西方工具共用；蜡烛图补充价格行为线索，其他工具帮助判断位置、趋势和目标。'},
    {title:'把形态放回市场环境',body:'先问此前是上涨、下跌还是横盘，再看形态出现在支撑、阻挡或区间中什么位置，最后观察后续价格是否确认。相同外形处在不同趋势位置，含义可以相反；反转信号更准确地说是“原趋势可能改变”，不保证立即反向运行。'},
    {title:'信号的边界与纪律',body:'形态定义可能有细微差异，实际走势也未必与示意图完全一致。很多信号要等周期收市后才成立；蜡烛图本身不提供可靠的价格目标，也不是万无一失的交易系统。应另设进出场、止损和风险报偿规则。'}
  ],
  ch02:[
    {title:'从地方市场到全国米市',body:'战国时代之后，日本逐步统一，商业和农业发展；大阪凭港口与仓储条件成为全国性的物资集散和金融中心。统一市场让不同地区的大米供需与价格信息能够汇集、比较，为持续观察价格变化提供了条件。'},
    {title:'堂岛交易所与米券',body:'淀屋家前院的大米交易活动逐步发展为大阪堂岛大米交易所。早期交易实物大米，后来交易以仓储大米为依据的米券；书中记载 1710 年后开始发行、接受米券。以未来收成作依据的“空米”交易被视作早期远期／期货交易。'},
    {title:'本间宗久与酒田经验',body:'书中记述本间宗久生于 1724 年（译注指出另有 1729 年说法），先在酒田大米市场经营，之后进入大阪堂岛市场。他不仅关注现货供需，也记录天气和历史价格，并尝试理解交易者心理；“酒田战法”与他的市场经验相关。'},
    {title:'历史故事怎样帮助学习',body:'这些背景说明价格分析与市场心理、信息传播和交易制度紧密相连，也解释了部分蜡烛图术语为何带有军事或生活意象。历史叙述提供的是方法形成的背景；不要把传奇化的战绩或后世传说，当成每种现代形态都已被精确验证的证据。'}
  ],
  ch03:[
    {title:'先确定一根线代表的周期',body:'一根蜡烛线可以代表日内数分钟、一个交易日或一周等时间单位。图上的四个价格都必须来自同一个周期：开市价是该周期首笔价格，收市价是末笔价格，最高价和最低价是周期内的极值。'},
    {title:'用四个价格定位各部分',body:'最高价是上影线顶端，最低价是下影线底端；开市价与收市价之间的范围是实体。若收市高于开市，收市端在实体上方；若收市低于开市，收市端在实体下方。没有上影线称光头线，没有下影线称光脚线。'},
    {title:'实体与影线分别提供线索',body:'较长实体表示该周期开收之间移动较大，可作为动量线索；短实体表示开收接近，称纺锤线，颜色和影线长短都不是其定义核心。影线表示价格曾经触及、但没有以实体收在那里的区域。它们描述发生过什么，不单独解释发生原因。'},
    {title:'十字线和小实体都要看上下文',body:'开市价与收市价相同或非常接近时，实体缩成横线，形成十字线。十字线常提示多空暂时平衡或犹豫，也可能是趋势变化的警告，但不能单凭它断定反转。结合前期走势、出现位置和后续收市确认。'},
    {title:'颜色约定与未完成线',body:'原书用黑／白实体区分收低／收高；本网页用绿色表示看跌、红色表示看涨，颜色不同但价格关系不变。实时周期尚未结束时，开高低收仍可能变化，实体颜色、影线和形态都可能改变；分析时要分清临时线和最终收市线。'}
  ]
};
function chapterGuideHTML(ch){
  const guide=CHAPTER_GUIDES[ch.id];
  if(!guide)return '';
  return `<aside class="chapter-guide" aria-label="${ch.num}学习导读"><div class="chapter-guide-head"><h3>本章学习导读</h3><span>先理解概念，再看下方知识卡片</span></div><div class="chapter-guide-grid">${guide.map((item,index)=>`<article class="guide-card"><h4><b>${String(index+1).padStart(2,'0')}</b>${item.title}</h4><p>${item.body}</p></article>`).join('')}</div></aside>`;
}
