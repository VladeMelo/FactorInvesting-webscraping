const puppeteer = require('puppeteer');

const sleep = seconds =>
  new Promise(resolve => setTimeout(resolve, (seconds || 1) * 1000))

const execute = async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();

  const findingAndFixingNumber = async(selector) => {
    const waitingNumber = await page.waitForSelector(selector, {
      timeout: 60000
    })
    .then(number => number.getProperty('innerText').then(numberInMillion => numberInMillion.jsonValue()))
    .catch(() => '-');

    if (waitingNumber === '-') {
      return '-';
    }
  
    const number = waitingNumber.slice(0, -2); // removing the " M", getting just the integer (Ex.: 3.078,19 M -> 3.078,19)

    let numberWithoutDotAndComma = '';
    for (let x = 0 ; x < number.length ; x++) {
      if (number[x] !== '.' && number[x] !== ',') {
        numberWithoutDotAndComma += number[x];
      }
    }
    // removing the comma and the dots, resulting in a number 100x greater (Ex.: 3.078,19 -> 307.819)

    return numberWithoutDotAndComma * 10000; // multiply by 1.000.000, because of the M of Million, and divide by 100, for taking out the comma
  }

  const sections = [
    '1/bens-industriais',
    '2/consumo-ciclico',
    '3/consumo-nao-ciclico',
    '4/financeiro-e-outros',
    '5/materiais-basicos',
    '6/petroleo-gas-e-biocombustiveis',
    '7/saude',
    '8/tecnologia-da-informacao',
    '9/comunicacoes',
    '10/utilidade-publica'
  ];
  const allTickers = [];

  for (let x = 0 ; x < sections.length ; x++) {
    await page.goto(`https://statusinvest.com.br/acoes/setor/${sections[x]}`);

    await page.select(`#main-2 > div > div > div.input-field.w-100.w-sm-50.w-md-15.pb-2.pr-sm-3 > div > select`, '1'); // to select the category "Ações"

    await page.select('#total-page-2', '-1'); // to select the category "TODOS"

    await sleep(3); // because of the delay that have in this transition

    const tickersSection = await page.$$eval('#companies > div.list.d-md-flex.flex-wrap.justify-between > div > div > div.info.w-100 > span > a', list => list.map(ticker => ticker.outerText));
    // get from this section all tickers from all stocks
    // .$$eval(selector) == Array.from(document.querySelectorAll(selector)) 

    const tickersWithRestrictions = tickersSection.reduce((total, ticker) => {
      if (total.length !== 0 && (ticker.slice(0, -1) === total[total.length - 1].slice(0, -1) || ticker.length > 5)) {
        // guarantee one ticker per stock and removes tickers with code greater than 9 
        return total;
      }

      total.push(ticker);
      return total;
    }, []);

    allTickers.push(...tickersWithRestrictions);
  }

  const tickerWithEvEbit = [];

  for (let y = 0 ; y < allTickers.length ; y++) {
    await page.goto(`https://statusinvest.com.br/acoes/${allTickers[y]}`);
    
    const waitingDailyLiquidity = await page.waitForSelector('#main-2 > div:nth-child(4) > div > div:nth-child(4) > div > div > div:nth-child(3) > div > div > div > strong', {
      timeout: 60000
    })
    .then(dailyLiquidity => dailyLiquidity.getProperty('innerText').then(liquidity => liquidity.jsonValue()))
    .catch(() => '-'); 

    const waitingLastResult = await page.waitForSelector('#contabil-section > div > div > div:nth-child(3) > div.scroll > div > table > thead > tr > th:nth-child(5)', {
      timeout: 60000
    })
    .then(lastResultYear => lastResultYear.getProperty('innerText').then(lastResult => lastResult.jsonValue()))
    .catch(() => '-');
    // last year that the company delivered all 4 quarters of the same year

    const waitingEnterpriseValue = await page.waitForSelector('#company-section > div > div.top-info.info-3.sm.d-flex.justify-between.mb-5 > div:nth-child(8) > div > div > strong', {
      timeout: 60000
    })
    .then(enterpriseValue => enterpriseValue.getProperty('innerText').then(numberInMillion => numberInMillion.jsonValue()))
    .catch(() => '-');

    if (waitingDailyLiquidity !== '-' && waitingLastResult !== '-' && waitingEnterpriseValue !== '-') { 
    // removing stocks that don't 'exist' anymore or don't have any result 

      const currentEbit = await findingAndFixingNumber('#contabil-section > div > div > div:nth-child(3) > div.scroll > div.table-info-body.small > table > tbody > tr:nth-child(7) > td.level-0.value.text-right.DATA.lastTwelveMonths > span');
      // ebit of the last 4 quartes (Ex.: 4T2019 - 3T2020)
  
      let lastEbit;
  
      if (new Date().getFullYear() - 2 == waitingLastResult || 
      (new Date().getFullYear() - 1 == waitingLastResult && new Date().getMonth() + 1 >= 8)) {
        // >= 8 means >= august, because i consider a good period to starting get the ebit from the current year and the last year

        lastEbit = await findingAndFixingNumber('#contabil-section > div > div > div:nth-child(3) > div.scroll > div.table-info-body > table > tbody > tr:nth-child(7) > td:nth-child(5) > span');
      } else {
        lastEbit = await findingAndFixingNumber('#contabil-section > div > div > div:nth-child(3) > div.scroll > div > table > tbody > tr:nth-child(7) > td:nth-child(8) > span');
      }
  
      let enterpriseValueWithoutDots = '';
      for (let x = 0 ; x < waitingEnterpriseValue.length ; x++) {
        if (waitingEnterpriseValue[x] !== '.') {
          enterpriseValueWithoutDots += waitingEnterpriseValue[x];
        }
      }
  
      const evEbit = Number((enterpriseValueWithoutDots / ((currentEbit + lastEbit) / 2)).toFixed(2));
      
      tickerWithEvEbit.push({
        ticker: allTickers[y],
        liquidity: waitingDailyLiquidity,
        evEbit
      });
    }
  }
  tickerWithEvEbit.forEach(e => console.log(e));
}

execute();