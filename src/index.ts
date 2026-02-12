import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Create server instance
const server = new McpServer({
    name: 'YOUR_SERVER_NAME',
    version: '1.0.0'
})

server.registerTool(
    'greet',
    {
        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
        inputSchema: z.object({
            name: z.string().describe('인사할 사람의 이름'),
            language: z
                .enum(['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de'])
                .optional()
                .default('en')
                .describe('인사 언어: ko(한국어), en(영어), ja(일본어), zh(중국어), es(스페인어), fr(프랑스어), de(독일어) (기본값: en)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('인사말')
                    })
                )
                .describe('인사말')
        })
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
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'calc',
    {
        description: '두 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
        inputSchema: z.object({
            a: z.number().describe('첫 번째 숫자'),
            b: z.number().describe('두 번째 숫자'),
            operator: z
                .enum(['+', '-', '*', '/'])
                .describe('연산자: +, -, *, /')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('연산 결과')
                    })
                )
                .describe('연산 결과')
        })
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
        }

        const text = `${a} ${operator} ${b} = ${result}`

        return {
            content: [
                {
                    type: 'text' as const,
                    text
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'now',
    {
        description: '타임존을 입력받아 해당 지역의 현재 시간을 반환합니다.',
        inputSchema: z.object({
            timezone: z
                .string()
                .optional()
                .default('UTC')
                .describe('IANA 타임존 (예: Asia/Seoul, America/New_York, Europe/London, UTC)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('현재 시간')
                    })
                )
                .describe('현재 시간')
        })
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
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text
                        }
                    ]
                }
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

server.registerTool(
    'geocode',
    {
        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다. (Nominatim OpenStreetMap API 사용)',
        inputSchema: z.object({
            query: z
                .string()
                .describe('검색할 도시 이름 또는 주소 (예: Seoul, 서울특별시, 1600 Amphitheatre Parkway)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('지오코딩 결과')
                    })
                )
                .describe('지오코딩 결과')
        })
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
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text
                        }
                    ]
                }
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : '알 수 없는 오류'
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

server.registerTool(
    'get-weather',
    {
        description:
            '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다. (Open-Meteo Weather API 사용)',
        inputSchema: z.object({
            latitude: z.number().describe('위도 (예: 37.5665)'),
            longitude: z.number().describe('경도 (예: 126.978)'),
            forecast_days: z
                .number()
                .min(1)
                .max(16)
                .optional()
                .default(3)
                .describe('예보 기간 (1~16일, 기본값: 3)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('날씨 정보')
                    })
                )
                .describe('날씨 정보')
        })
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
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text
                        }
                    ]
                }
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : '알 수 없는 오류'
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

server.registerTool(
    'generate-image',
    {
        description:
            'HuggingFace Inference API를 사용하여 텍스트 프롬프트로 이미지를 생성합니다.',
        inputSchema: z.object({
            prompt: z.string().describe('이미지 생성 프롬프트'),
            num_inference_steps: z
                .number()
                .min(1)
                .max(10)
                .optional()
                .default(4)
                .describe('추론 스텝 수 (1~10, 기본값: 4)')
        })
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
                error instanceof Error ? error.message : '알 수 없는 오류'
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

// Resource: 서버 정보
const startTime = Date.now()

server.registerResource(
    'server-info',
    'info://server',
    {
        title: 'MCP 서버 정보',
        description: '현재 MCP 서버의 기본 정보를 반환합니다.',
        mimeType: 'application/json'
    },
    async (uri) => {
        const uptimeMs = Date.now() - startTime
        const uptimeSec = Math.floor(uptimeMs / 1000)
        const hours = Math.floor(uptimeSec / 3600)
        const minutes = Math.floor((uptimeSec % 3600) / 60)
        const seconds = uptimeSec % 60

        const info = {
            server: {
                name: 'my-mcp-server',
                version: '1.0.0',
                description: 'TypeScript MCP Server Boilerplate'
            },
            tools: [
                'greet - 다국어 인사말 (ko, en, ja, zh, es, fr, de)',
                'calc - 사칙연산 계산기',
                'now - 타임존별 현재 시간 조회',
                'geocode - 주소/도시명 → 위도/경도 변환 (Nominatim API)',
                'get-weather - 위도/경도 기반 날씨 조회 (Open-Meteo API)',
                'generate-image - 텍스트 프롬프트로 이미지 생성 (HuggingFace Inference API)'
            ],
            runtime: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                uptime: `${hours}시간 ${minutes}분 ${seconds}초`
            },
            timestamp: new Date().toISOString()
        }

        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(info, null, 2)
                }
            ]
        }
    }
)

// Prompt: 코드 리뷰
server.registerPrompt(
    'code-review',
    {
        title: '코드 리뷰',
        description:
            '코드를 입력받아 우리 팀의 코드 리뷰 기준에 맞는 리뷰 프롬프트를 반환합니다.',
        argsSchema: {
            code: z.string().describe('리뷰할 코드')
        }
    },
    async ({ code }) => ({
        messages: [
            {
                role: 'user' as const,
                content: {
                    type: 'text' as const,
                    text: [
                        '당신은 시니어 개발자입니다. 아래 코드를 우리 팀의 코드 리뷰 기준에 따라 리뷰해주세요.',
                        '',
                        '## 코드 리뷰 기준',
                        '',
                        '### 1. 가독성',
                        '- 변수/함수 이름이 명확하고 의미를 잘 전달하는가?',
                        '- 코드가 적절히 구조화되어 있는가?',
                        '- 불필요한 주석 없이도 코드 의도가 드러나는가?',
                        '',
                        '### 2. 유지보수성',
                        '- 단일 책임 원칙(SRP)을 따르고 있는가?',
                        '- 중복 코드가 없는가?',
                        '- 적절한 추상화 수준을 유지하고 있는가?',
                        '',
                        '### 3. 에러 처리',
                        '- 예외 상황을 적절히 처리하고 있는가?',
                        '- 에러 메시지가 디버깅에 유용한가?',
                        '- 엣지 케이스를 고려했는가?',
                        '',
                        '### 4. 성능',
                        '- 불필요한 연산이나 메모리 사용은 없는가?',
                        '- N+1 쿼리 등 성능 이슈가 없는가?',
                        '- 적절한 자료구조를 사용하고 있는가?',
                        '',
                        '### 5. 보안',
                        '- 사용자 입력을 검증하고 있는가?',
                        '- 민감 정보가 노출되지 않는가?',
                        '- 인젝션 공격에 취약하지 않은가?',
                        '',
                        '## 리뷰 대상 코드',
                        '',
                        '```',
                        code,
                        '```',
                        '',
                        '## 응답 형식',
                        '',
                        '각 기준별로 다음 형식으로 리뷰해주세요:',
                        '',
                        '- ✅ **통과**: 기준을 충족하는 항목',
                        '- ⚠️ **개선 제안**: 개선하면 좋을 항목 (구체적인 개선 코드 포함)',
                        '- ❌ **수정 필요**: 반드시 수정해야 할 항목 (구체적인 수정 코드 포함)',
                        '',
                        '마지막에 전체 요약과 종합 점수(1~10)를 제시해주세요.'
                    ].join('\n')
                }
            }
        ]
    })
)

server
    .connect(new StdioServerTransport())
    .catch(console.error)
    .then(() => {
        console.log('MCP server started')
    })
