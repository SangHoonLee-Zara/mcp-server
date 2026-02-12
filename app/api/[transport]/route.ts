import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

const handler = createMcpHandler(
    (server) => {
        // Tool: greet
        server.tool(
            'greet',
            '이름과 언어를 입력하면 인사말을 반환합니다.',
            {
                name: z.string().describe('인사할 사람의 이름'),
                language: z
                    .enum(['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de'])
                    .optional()
                    .default('en')
                    .describe(
                        '인사 언어: ko(한국어), en(영어), ja(일본어), zh(중국어), es(스페인어), fr(프랑스어), de(독일어) (기본값: en)'
                    )
            },
            async ({ name, language }) => {
                const greetings: Record<string, string> = {
                    ko: `안녕하세요, ${name}님!`,
                    en: `Hey there, ${name}! 👋 Nice to meet you!`,
                    ja: `こんにちは、${name}さん！`,
                    zh: `你好，${name}！`,
                    es: `¡Hola, ${name}! ¿Qué tal?`,
                    fr: `Bonjour, ${name} ! Enchanté(e) !`,
                    de: `Hallo, ${name}! Freut mich!`
                }

                const greeting = greetings[language] ?? greetings['en']

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: greeting
                        }
                    ]
                }
            }
        )

        // Tool: calc
        server.tool(
            'calc',
            '두 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
            {
                a: z.number().describe('첫 번째 숫자'),
                b: z.number().describe('두 번째 숫자'),
                operator: z
                    .enum(['+', '-', '*', '/'])
                    .describe('연산자: +, -, *, /')
            },
            async ({ a, b, operator }) => {
                let result: number

                switch (operator) {
                    case '+':
                        result = a + b
                        break
                    case '-':
                        result = a - b
                        break
                    case '*':
                        result = a * b
                        break
                    case '/':
                        if (b === 0) {
                            return {
                                content: [
                                    {
                                        type: 'text' as const,
                                        text: '오류: 0으로 나눌 수 없습니다.'
                                    }
                                ]
                            }
                        }
                        result = a / b
                        break
                    default:
                        result = 0
                }

                const text = `${a} ${operator} ${b} = ${result}`

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text
                        }
                    ]
                }
            }
        )

        // Tool: now
        server.tool(
            'now',
            '타임존을 입력받아 해당 지역의 현재 시간을 반환합니다.',
            {
                timezone: z
                    .string()
                    .optional()
                    .default('UTC')
                    .describe(
                        'IANA 타임존 (예: Asia/Seoul, America/New_York, Europe/London, UTC)'
                    )
            },
            async ({ timezone }) => {
                try {
                    const now = new Date()
                    const formatted = now.toLocaleString('ko-KR', {
                        timeZone: timezone,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    })

                    const text = `[${timezone}] 현재 시간: ${formatted}`

                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text
                            }
                        ]
                    }
                } catch {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `오류: '${timezone}'은(는) 유효하지 않은 타임존입니다. IANA 타임존 형식을 사용해주세요. (예: Asia/Seoul, America/New_York)`
                            }
                        ]
                    }
                }
            }
        )

        // Tool: geocode
        server.tool(
            'geocode',
            '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다. (Nominatim OpenStreetMap API 사용)',
            {
                query: z
                    .string()
                    .describe(
                        '검색할 도시 이름 또는 주소 (예: Seoul, 서울특별시, 1600 Amphitheatre Parkway)'
                    )
            },
            async ({ query }) => {
                try {
                    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`

                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'MCP-Geocode-Tool/1.0'
                        }
                    })

                    if (!response.ok) {
                        throw new Error(`API 요청 실패: ${response.status}`)
                    }

                    const data = (await response.json()) as Array<{
                        display_name: string
                        lat: string
                        lon: string
                    }>

                    if (!data || data.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `'${query}'에 대한 검색 결과가 없습니다.`
                                }
                            ]
                        }
                    }

                    const result = data[0]
                    const text = [
                        `📍 ${result.display_name}`,
                        `위도(lat): ${result.lat}`,
                        `경도(lon): ${result.lon}`
                    ].join('\n')

                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text
                            }
                        ]
                    }
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : '알 수 없는 오류'
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `오류: 지오코딩 실패 - ${message}`
                            }
                        ]
                    }
                }
            }
        )

        // Tool: get-weather
        server.tool(
            'get-weather',
            '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다. (Open-Meteo Weather API 사용)',
            {
                latitude: z.number().describe('위도 (예: 37.5665)'),
                longitude: z.number().describe('경도 (예: 126.978)'),
                forecast_days: z
                    .number()
                    .min(1)
                    .max(16)
                    .optional()
                    .default(3)
                    .describe('예보 기간 (1~16일, 기본값: 3)')
            },
            async ({ latitude, longitude, forecast_days }) => {
                try {
                    const currentParams = [
                        'temperature_2m',
                        'relative_humidity_2m',
                        'apparent_temperature',
                        'weather_code',
                        'wind_speed_10m',
                        'wind_direction_10m',
                        'precipitation'
                    ].join(',')

                    const dailyParams = [
                        'weather_code',
                        'temperature_2m_max',
                        'temperature_2m_min',
                        'precipitation_sum',
                        'precipitation_probability_max',
                        'wind_speed_10m_max'
                    ].join(',')

                    const url =
                        `https://api.open-meteo.com/v1/forecast` +
                        `?latitude=${latitude}&longitude=${longitude}` +
                        `&current=${currentParams}` +
                        `&daily=${dailyParams}` +
                        `&forecast_days=${forecast_days}` +
                        `&timezone=auto`

                    const response = await fetch(url)

                    if (!response.ok) {
                        throw new Error(`API 요청 실패: ${response.status}`)
                    }

                    const data = (await response.json()) as {
                        timezone: string
                        current: {
                            time: string
                            temperature_2m: number
                            relative_humidity_2m: number
                            apparent_temperature: number
                            weather_code: number
                            wind_speed_10m: number
                            wind_direction_10m: number
                            precipitation: number
                        }
                        current_units: {
                            temperature_2m: string
                            relative_humidity_2m: string
                            apparent_temperature: string
                            wind_speed_10m: string
                            precipitation: string
                        }
                        daily: {
                            time: string[]
                            weather_code: number[]
                            temperature_2m_max: number[]
                            temperature_2m_min: number[]
                            precipitation_sum: number[]
                            precipitation_probability_max: number[]
                            wind_speed_10m_max: number[]
                        }
                        daily_units: {
                            temperature_2m_max: string
                            precipitation_sum: string
                            wind_speed_10m_max: string
                        }
                    }

                    const weatherCodes: Record<number, string> = {
                        0: '맑음 ☀️',
                        1: '대체로 맑음 🌤️',
                        2: '부분적으로 흐림 ⛅',
                        3: '흐림 ☁️',
                        45: '안개 🌫️',
                        48: '서리 안개 🌫️',
                        51: '가벼운 이슬비 🌦️',
                        53: '이슬비 🌦️',
                        55: '강한 이슬비 🌦️',
                        56: '가벼운 착빙성 이슬비 🌧️',
                        57: '강한 착빙성 이슬비 🌧️',
                        61: '약한 비 🌧️',
                        63: '비 🌧️',
                        65: '강한 비 🌧️',
                        66: '가벼운 착빙성 비 🌧️',
                        67: '강한 착빙성 비 🌧️',
                        71: '약한 눈 🌨️',
                        73: '눈 🌨️',
                        75: '강한 눈 🌨️',
                        77: '싸락눈 🌨️',
                        80: '약한 소나기 🌦️',
                        81: '소나기 🌦️',
                        82: '강한 소나기 🌦️',
                        85: '약한 눈소나기 🌨️',
                        86: '강한 눈소나기 🌨️',
                        95: '뇌우 ⛈️',
                        96: '약한 우박 뇌우 ⛈️',
                        99: '강한 우박 뇌우 ⛈️'
                    }

                    const getWeatherDesc = (code: number) =>
                        weatherCodes[code] ?? `알 수 없음 (${code})`

                    const c = data.current
                    const cu = data.current_units

                    const lines: string[] = [
                        `📍 좌표: ${latitude}, ${longitude} (${data.timezone})`,
                        '',
                        `🌡️ 현재 날씨 (${c.time})`,
                        `  상태: ${getWeatherDesc(c.weather_code)}`,
                        `  기온: ${c.temperature_2m}${cu.temperature_2m} (체감 ${c.apparent_temperature}${cu.apparent_temperature})`,
                        `  습도: ${c.relative_humidity_2m}${cu.relative_humidity_2m}`,
                        `  바람: ${c.wind_speed_10m}${cu.wind_speed_10m} (${c.wind_direction_10m}°)`,
                        `  강수량: ${c.precipitation}${cu.precipitation}`,
                        '',
                        `📅 ${forecast_days}일 예보:`
                    ]

                    const d = data.daily
                    const du = data.daily_units
                    for (let i = 0; i < d.time.length; i++) {
                        lines.push(
                            `  ${d.time[i]} | ${getWeatherDesc(d.weather_code[i])} | ${d.temperature_2m_min[i]}~${d.temperature_2m_max[i]}${du.temperature_2m_max} | 강수 ${d.precipitation_sum[i]}${du.precipitation_sum} (확률 ${d.precipitation_probability_max[i]}%) | 최대풍속 ${d.wind_speed_10m_max[i]}${du.wind_speed_10m_max}`
                        )
                    }

                    const text = lines.join('\n')

                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text
                            }
                        ]
                    }
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : '알 수 없는 오류'
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `오류: 날씨 정보를 가져올 수 없습니다 - ${message}`
                            }
                        ]
                    }
                }
            }
        )

        // Tool: generate-image
        server.tool(
            'generate-image',
            'HuggingFace Inference API를 사용하여 텍스트 프롬프트로 이미지를 생성합니다.',
            {
                prompt: z.string().describe('이미지 생성 프롬프트'),
                num_inference_steps: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .default(4)
                    .describe('추론 스텝 수 (1~10, 기본값: 4)')
            },
            async ({ prompt, num_inference_steps }) => {
                const hfToken = process.env.HF_TOKEN
                if (!hfToken) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: '오류: HF_TOKEN 환경변수가 설정되지 않았습니다. HuggingFace API를 사용하려면 HF_TOKEN 환경변수를 설정해주세요.'
                            }
                        ]
                    }
                }

                try {
                    const client = new InferenceClient(hfToken)
                    const image = await client.textToImage(
                        {
                            provider: 'together',
                            model: 'black-forest-labs/FLUX.1-schnell',
                            inputs: prompt,
                            parameters: { num_inference_steps }
                        },
                        { outputType: 'blob' as const }
                    )

                    const arrayBuffer = await image.arrayBuffer()
                    const base64 = Buffer.from(arrayBuffer).toString('base64')

                    return {
                        content: [
                            {
                                type: 'image' as const,
                                data: base64,
                                mimeType: 'image/png'
                            }
                        ]
                    }
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : '알 수 없는 오류'
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `오류: 이미지 생성 실패 - ${message}`
                            }
                        ]
                    }
                }
            }
        )
    },
    {
        serverInfo: {
            name: 'my-mcp-server',
            version: '1.0.0'
        }
    },
    {
        basePath: '/api',
        maxDuration: 60,
        verboseLogs: true
    }
)

export { handler as GET, handler as POST, handler as DELETE }
