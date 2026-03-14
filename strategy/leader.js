export function detectLeaders(stocks){

  const sectorMap = {}

  stocks.forEach(s=>{

    const sec = s.sector || "default"

    if(!sectorMap[sec]){
      sectorMap[sec] = []
    }

    sectorMap[sec].push(s)

  })

  const leaders = []

  for(const sec in sectorMap){

    const group = sectorMap[sec]

    group.sort((a,b)=>b.amount-a.amount)

    leaders.push(...group.slice(0,2))

  }

  return leaders.map(s=>s.code)

}