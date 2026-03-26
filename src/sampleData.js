// Sample data extracted from the uploaded 3-28-2026_Log_Book_.xlsx
// Used in demo mode when SharePoint is not connected

const FOREMAN_ORDER = ['Jeremy','Phil','Matt','Kritter','Eddie','Foley','Ayotte','Brian'];

function buildCrews() {
  return {
    Jeremy: { members: [
      { name: "Colby", qual: "T" }, { name: "John D", qual: null }, { name: "Emanny", qual: "A" }, { name: "Scott", qual: "A" },
    ]},
    Phil: { members: [
      { name: "Dave", qual: "T" }, { name: "Weeb", qual: "T" }, { name: "Jenny", qual: null }, { name: "Rich P", qual: null },
    ]},
    Matt: { members: [
      { name: "Ricky", qual: "V" }, { name: "Juan", qual: "V" }, { name: "Kevin H", qual: null }, { name: "Pat C", qual: "A" },
    ]},
    Kritter: { members: [
      { name: "Neil", qual: "T" }, { name: "Christian", qual: null }, { name: "Chris C", qual: null }, { name: "Johnny", qual: null },
    ]},
    Eddie: { members: [
      { name: "Oscar", qual: "V" }, { name: "Pete", qual: "V" }, { name: "Longo", qual: "T" }, { name: "Sophia", qual: "A" },
    ]},
    Foley: { members: [
      { name: "Eastman", qual: "T" }, { name: "Craig", qual: null }, { name: "Tom W", qual: "V" }, { name: "Moe", qual: null }, { name: "Chitunda", qual: null },
    ]},
    Ayotte: { members: [
      { name: "Josh", qual: null }, { name: "Trea", qual: "T" }, { name: "Rich", qual: "T" },
    ]},
    Brian: { members: [
      { name: "Mark", qual: null }, { name: "Mike G", qual: "V" }, { name: "Chris R", qual: "T" },
    ]},
  };
}

function buildPools() {
  return {
    laborers: [{ name: "Peter K" },{ name: "Brian D" },{ name: "Patrick" },{ name: "Marc D" },{ name: "Tim H" }],
    drivers: [{ name: "Mike D" },{ name: "Draper" },{ name: "Pat" }],
    extra: [{ name: "Tom H" },{ name: "Dave P" },{ name: "Al" },{ name: "Paul" },{ name: "Brett" },{ name: "Dave O" },{ name: "Christien G" },{ name: "Ronny" },{ name: "Dom C" },{ name: "Steve T" },{ name: "Steve D" },{ name: "Dennis" },{ name: "Steve C" },{ name: "Dan M" },{ name: "Peter G" },{ name: "Curtis" },{ name: "Dave Piz" }],
  };
}

export const SAMPLE_DATA = {
  Sunday: { day:"Sunday",date:"2026-03-22", jobs:[
    {num:1,customer:"RMV",poJob:"16632",location:"490 Forest Ave Brockton",onsiteTime:"6am",trucks:"Hub 5",numMen:6,crew:["Eddie","Matt","Ricky","Oscar","Phil","Pete","Pat-t"],calledIn:"D",jobFolder:"sm"},
  ], crews:buildCrews(), pools:buildPools() },
  Monday: { day:"Monday",date:"2026-03-23", jobs:[
    {num:1,customer:"Hilton Back Bay",poJob:"16332",location:"40 Dalton St Boston",onsiteTime:"6:30am",trucks:"na",numMen:5,crew:["Jeremy","Colby","John D","Brian D","Dave O"],calledIn:"R",jobFolder:null},
    {num:9,customer:"Vialto",poJob:"16957",location:"100 Cambridge St Fl 14 Boston",onsiteTime:"6pm",trucks:"Hub 2",numMen:2,crew:["Ayotte","Kritter","Mike-T"],calledIn:"J",jobFolder:null},
    {num:10,customer:"Hilton Back Bay",poJob:null,location:"40 Dalton St Boston",onsiteTime:"1:30pm",trucks:"HUB 7,3",numMen:5,crew:["Ronny","Trea","Dom C","Johnny","Scott"],calledIn:"R",jobFolder:null},
  ], crews:buildCrews(), pools:buildPools() },
  Tuesday: { day:"Tuesday",date:"2026-03-24", jobs:[
    {num:1,customer:"Hilton Back Bay",poJob:"16332",location:"40 Dalton St Boston",onsiteTime:"6:30am",trucks:"na",numMen:9,crew:["Jeremy","Colby","John D","Brian D","Dave O","Foley","Juan","Brian","Neil","Pete"],calledIn:"R",jobFolder:null},
    {num:2,customer:"Atreides",poJob:"17027",location:"1 International Place Fl 44 Boston",onsiteTime:"6am",trucks:"van",numMen:2,crew:["Eddie","Oscar"],calledIn:"G",jobFolder:"sm"},
    {num:3,customer:"Arrowstreet",poJob:"15252A",location:"200 Clarendon St Fl 32 Boston",onsiteTime:"6am",trucks:"Hub 5",numMen:2,crew:["Phil","Weeb","Mike-T"],calledIn:"D",jobFolder:"sm"},
    {num:4,customer:"DFCI",poJob:"17168",location:"10 Brookline Place Brookline",onsiteTime:"6am",trucks:"Hub 5",numMen:2,crew:["Matt","Ricky","Mike-T"],calledIn:"D",jobFolder:"sm"},
    {num:5,customer:"Vialto",poJob:"16957",location:"10 Winthrop Sq Boston",onsiteTime:"6am",trucks:"na",numMen:2,crew:["Ayotte","Kritter"],calledIn:"J",jobFolder:"sm"},
    {num:6,customer:"OPOS",poJob:"17203",location:"1 PO Square Fl12 Boston",onsiteTime:"6am",trucks:"n/a",numMen:1,crew:["Craig"],calledIn:"R",jobFolder:null},
    {num:10,customer:"Hilton Back Bay",poJob:null,location:"40 Dalton St Boston",onsiteTime:"1:30pm",trucks:"na",numMen:5,crew:["Ronny","Trea","Dom C","Johnny","Scott"],calledIn:"R",jobFolder:null},
  ], crews:buildCrews(), pools:buildPools() },
  Wednesday: { day:"Wednesday",date:"2026-03-25", jobs:[
    {num:1,customer:"Hilton Back Bay",poJob:"16332",location:"40 Dalton St Boston",onsiteTime:"6:30am",trucks:"na",numMen:9,crew:["Jeremy","Colby","John D","Brian D","Dave O","Juan","Brian","Neil","Pete"],calledIn:"R",jobFolder:null},
    {num:2,customer:"DFCI",poJob:"17168",location:"50 Industrial Ave Hyde Park",onsiteTime:"6am",trucks:"Hub 3",numMen:2,crew:["Matt","Ricky","Mike-T"],calledIn:"D",jobFolder:null},
    {num:3,customer:"Ligris",poJob:"16073a",location:"20 Park Plaza Fl 12 Boston",onsiteTime:"6am",trucks:"Hub 5",numMen:2,crew:["Eddie","Oscar","Pat-T"],calledIn:"D",jobFolder:"y"},
    {num:4,customer:"Camp Harbor View",poJob:"15407a",location:"135 Morrissey Blvd Boston",onsiteTime:"6am",trucks:"1",numMen:2,crew:["Craig","Moe","Draper-t"],calledIn:"R",jobFolder:null},
    {num:5,customer:"Ligris",poJob:"16073B",location:"1188 Centre St Newton Centre",onsiteTime:null,trucks:"Hub 5",numMen:1,crew:["Pat-T"],calledIn:"D",jobFolder:null},
    {num:6,customer:"Vialto",poJob:"16957",location:"10 Winthrop Sq Boston",onsiteTime:"6am",trucks:"Hub 7",numMen:1,crew:["Ayotte","Kritter","Draper-T"],calledIn:"JE",jobFolder:null},
    {num:7,customer:"Finn Partners",poJob:"16236D",location:"200 State St Fl 3 Boston",onsiteTime:"7am",trucks:"Hub 7",numMen:1,crew:["Ayotte","Kritter","Draper-T"],calledIn:"JE",jobFolder:"y"},
    {num:8,customer:"Highland Strategy",poJob:"17014a",location:"101 Arch St Suite 1560 Boston",onsiteTime:"5pm",trucks:"Hub 3",numMen:4,crew:["Matt","Ricky","Pat C","Christian","Eddie","Draper-T"],calledIn:"D",jobFolder:"n"},
    {num:9,customer:"Mastercard Boston",poJob:"16872",location:"225 Franklin St Fl9 Boston",onsiteTime:"4pm",trucks:"Hub 2",numMen:2,crew:["Phil","Weeb","Pat-T"],calledIn:"G",jobFolder:"y"},
    {num:10,customer:"Hilton Back Bay",poJob:null,location:"40 Dalton St Boston",onsiteTime:"1:30pm",trucks:"Hub 6,4",numMen:5,crew:["Ronny","Trea","Dom C","Johnny","Scott"],calledIn:"R",jobFolder:null},
    {num:11,customer:"Metal Run",poJob:null,location:null,onsiteTime:null,trucks:"Hub 2",numMen:1,crew:["Pat-T"],calledIn:null,jobFolder:null},
  ], crews:buildCrews(), pools:buildPools() },
  Thursday: { day:"Thursday",date:"2026-03-26", jobs:[
    {num:1,customer:"Hilton Back Bay",poJob:"16332",location:"40 Dalton St Boston",onsiteTime:"6:30am",trucks:"na",numMen:8,crew:["Jeremy","Colby","John D","Brian D","Dave O","Juan","Brian","Emanny","Pete"],calledIn:"R",jobFolder:null},
    {num:2,customer:"Boston Globe",poJob:"16123",location:"53 State St Boston",onsiteTime:"6am",trucks:"Hub 7",numMen:5,crew:["Eddie","Rich","Oscar","Jenny","Longo","Pat-T","Neil"],calledIn:"D",jobFolder:"y"},
    {num:3,customer:"Avangrid",poJob:"17234",location:"125 High St",onsiteTime:"7-8am",trucks:"na",numMen:2,crew:["Ayotte","Kritter"],calledIn:"G",jobFolder:null},
    {num:4,customer:"Congress Asset Mgmt",poJob:"16621B",location:"2 Seaport Ln Boston",onsiteTime:"6am",trucks:"van",numMen:2,crew:["Ayotte","Kritter"],calledIn:"D",jobFolder:"y"},
    {num:5,customer:"Highland Strategy",poJob:"17014a",location:"101 Arch St Suite 1560 Boston",onsiteTime:"7am",trucks:"na",numMen:4,crew:["Matt","Ricky","Pat C","Christian"],calledIn:"D",jobFolder:null},
    {num:6,customer:"Alnylam",poJob:"17010",location:"300 Third St Fl 2 Boston",onsiteTime:"6am",trucks:"1, Hub 7",numMen:4,crew:["Phil","Dave","Chitunda","Kevin H","Chris R","Draper-t","Pat-T"],calledIn:"G",jobFolder:null},
    {num:7,customer:"Schneider Electric",poJob:"16484A",location:"115 Federal St Fl 10-11 Boston",onsiteTime:"7am",trucks:"n/a",numMen:2,crew:["Craig","Moe"],calledIn:"R",jobFolder:"y"},
    {num:8,customer:"Camp Harbor View",poJob:"15407a",location:"135 Morrissey Blvd Boston",onsiteTime:"6am",trucks:"Hub 5",numMen:2,crew:["Craig","Moe","Mike-t"],calledIn:"R",jobFolder:"n"},
    {num:10,customer:"Hilton Back Bay",poJob:null,location:"40 Dalton St Boston",onsiteTime:"1:30pm",trucks:"2",numMen:5,crew:["Ronny","Trea","Dom C","Johnny","Scott"],calledIn:"R",jobFolder:null},
  ], crews:buildCrews(), pools:buildPools() },
  Friday: { day:"Friday",date:"2026-03-27", jobs:[
    {num:1,customer:"Hilton Back Bay",poJob:"16332",location:"40 Dalton St Boston",onsiteTime:"6:30am",trucks:"na",numMen:9,crew:["Jeremy","Colby","John D","Brian D","Dave O","Juan","Brian","Emanny","Pete"],calledIn:"R",jobFolder:null},
    {num:2,customer:"KKR",poJob:"16972",location:"2 International Place Fl 9 Boston",onsiteTime:"6am",trucks:"1",numMen:6,crew:["Phil","Dave","Kevin H","Mark","Kritter","Weeb","Mike-T"],calledIn:"D",jobFolder:"n"},
    {num:3,customer:"KKR",poJob:"16972",location:"516 Broadway Lawrence MA",onsiteTime:"7-8am",trucks:"1",numMen:1,crew:["Mike-T"],calledIn:"D",jobFolder:"n"},
    {num:4,customer:"Boston Globe",poJob:"16123",location:"53 State St Boston",onsiteTime:"6am",trucks:"1",numMen:4,crew:["Eddie","Oscar","Rich","Jenny","Longo","Draper-T","Neil"],calledIn:"D",jobFolder:"n"},
    {num:6,customer:"Merganser",poJob:"16822",location:"99 High St Boston",onsiteTime:"6am",trucks:"van",numMen:2,crew:["Ayotte","Mike G"],calledIn:"G",jobFolder:"y"},
    {num:7,customer:"Nimbus Therapeutics",poJob:"16568",location:"22 Boston Wharf Rd Fl 9 Boston",onsiteTime:"6am",trucks:"1",numMen:2,crew:["Chris R","Tom H"],calledIn:"D",jobFolder:"sm"},
    {num:8,customer:"Great Gray",poJob:"15791B",location:"40 Rowes Wharf Boston",onsiteTime:"6am",trucks:"1",numMen:2,crew:["Matt","Ricky","Pat-T"],calledIn:"G",jobFolder:"y"},
    {num:9,customer:"Shawmut",poJob:"17038",location:"560 Harrison Ave",onsiteTime:"6am",trucks:"1",numMen:3,crew:["Foley","Brett","Pat C","Pat-T"],calledIn:"G",jobFolder:"y"},
    {num:10,customer:"KKR",poJob:"16972",location:"2 International Place Fl 9 Boston",onsiteTime:"5pm",trucks:"na",numMen:6,crew:["Phil","Dave","Kevin H","Mark","Kritter","Weeb"],calledIn:"D",jobFolder:null},
    {num:11,customer:"Hilton Back Bay",poJob:null,location:"40 Dalton St Boston",onsiteTime:"1:30pm",trucks:"1",numMen:5,crew:["Ronny","Trea","Dom C","Johnny","Scott"],calledIn:"R",jobFolder:null},
    {num:12,customer:"Star Sales Pick up",poJob:null,location:null,onsiteTime:null,trucks:"1",numMen:1,crew:["Pat-t"],calledIn:null,jobFolder:"n"},
    {num:13,customer:"Congress Asset Mgmt",poJob:"16621B",location:"2 Seaport Ln Boston",onsiteTime:null,trucks:"van",numMen:1,crew:["Ayotte"],calledIn:"D",jobFolder:"n"},
  ], crews:buildCrews(), pools:buildPools() },
  Saturday: { day:"Saturday",date:"2026-03-28", jobs:[
    {num:1,customer:"Moody Lynn",poJob:"16492",location:"1 Beacon St 23rd Fl Boston",onsiteTime:null,trucks:"1",numMen:null,crew:["Eddie","Matt","Draper-T"],calledIn:"G",jobFolder:"y"},
    {num:2,customer:"KKR",poJob:"16972",location:"2 International Place Fl 9 Boston",onsiteTime:"6am",trucks:"1",numMen:6,crew:["Phil","Dave","Jenny","Kritter","Ayotte","Brian","Draper"],calledIn:"D",jobFolder:null},
  ], crews:buildCrews(), pools:buildPools() },
};

export { FOREMAN_ORDER };
