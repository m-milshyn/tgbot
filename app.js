const TelegramBot = require('node-telegram-bot-api');
const { translate } = require('google-translate-api-browser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = './data.json';

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

function saveData(key, data) {
    let jsonData = {};
    if (fs.existsSync(path)) {
        jsonData = JSON.parse(fs.readFileSync(path));
    }
    jsonData[key] = data;
    fs.writeFileSync(path, JSON.stringify(jsonData, null, 2));
}

function loadData(key) {
    if (fs.existsSync(path)) {
        const jsonData = JSON.parse(fs.readFileSync(path));
        return jsonData[key] || {};
    }
    return {};
}

let userInfo = loadData('userInfo');
let expertHelpInfo = loadData('expertHelpInfo');
let userStates = loadData('userStates');
let questionnaireAnswer = loadData('questionnaireAnswer');
let defaultLanguage = "ru";

for (let chatId in userInfo) {
    restoreUserState(bot, userInfo, chatId);
}

bot.onText(/\/start/, async (msg) => {
    userInfo = loadData('userInfo');
    expertHelpInfo = loadData('expertHelpInfo');
    userStates = loadData('userStates');
    questionnaireAnswer = loadData('questionnaireAnswer');
    console.log(userInfo);
    userLanguage = getUserLanguage(msg);
    console.log(userLanguage);
    userInfo[msg.chat.id] = {
        language: userLanguage,
        state: 'start',
        lastMessageId: msg.message_id
    };

    saveData('userInfo', userInfo);
    if (userInfo[msg.chat.id] && userInfo[msg.chat.id].language) {
        userLanguage = defaultLanguage;
    } else {
        userLanguage = userInfo[msg.chat.id].language;
    }

    saveData('userInfo', userInfo);

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: await translateText("Анкета", userLanguage), callback_data: "questionnaire"
                    }
                ],
                [
                    {
                        text: await translateText("Экспертная помощь с недвижимостью", userLanguage), callback_data: "expert_help"
                    }
                ],
                [
                    {
                        text: await translateText("О нас", userLanguage), url: 'https://t.me'
                    }
                ],
                [
                    {
                        text: await translateText("Стратегии инвестирования", userLanguage), callback_data: "strategies"
                    }
                ]
            ]
        }
    };

    await bot.sendMessage(msg.chat.id, await translateText(
        "Приветствуем вас в АН “Condor Real Estates”!\n\n" +
        "Мы рады приветствовать вас в нашем Telegram-боте! Наша инвестиционная компания специализируется на недвижимости на Бали, предоставляя вам уникальные возможности для выгодных вложений в один из самых живописных уголков мира.\n\n" +
        "Мы предлагаем широкий спектр услуг, включая покупку, продажу и аренду недвижимости, а также консультации по инвестициям и управлению объектами. Наши эксперты всегда готовы помочь вам найти наилучшие решения для достижения ваших финансовых целей.\n\n" +
        "С чего вам начать ⁉️\n" +
        "➡️Пройти опрос, чтобы мы смогли подобрать вам варианты недвижимости под ваш запрос и вы наглядно увидели, что можете получить на ваш бюджет.\n➡️Следите за нашими обновлениями, получайте актуальную информацию о новых объектах и специальных предложениях, а также задавайте вопросы — мы всегда на связи и готовы помочь!\n\n" +
        "Спасибо, что выбрали нас. Давайте вместе создадим Ваше успешное будущее на Бали!\n\n" +
        "⬇️Сделайте свой выбор⬇️",
        userLanguage
    ), opts);
});

async function startExpertHelp(msg) {
    const chatId = msg.chat.id;
    const userLanguage = (userInfo[chatId] && userInfo[chatId].language) ? userInfo[chatId].language : defaultLanguage;

    const processId = uuidv4();
    userStates[chatId] = { step: 'awaitingEmail', processId };
    userInfo[chatId].state = 'awaiting_email';
    userInfo[chatId].lastMessageId = msg.message_id;
    saveData('userStates', userStates);
    if (userStates[chatId] && userStates[chatId].handler) {
        bot.removeListener('message', userStates[chatId].handler);
    }

    const handleMessage = async (msg) => {
        if (msg.chat.id === chatId) {
            if (userStates[chatId] && userStates[chatId].processId === processId) {
                switch (userStates[chatId].step) {
                    case 'awaitingEmail':
                        await handleEmail(msg);
                        break;
                    case 'awaitingPhone':
                        await handlePhone(msg);
                        break;
                    case 'awaitingFIO':
                        await handleFIO(msg);
                        break;
                }
            }
        }
    };

    userStates[chatId].handler = handleMessage;
    saveData('userStates', userStates);
    bot.on('message', handleMessage);

    await bot.sendMessage(chatId, await translateText('Пожалуйста, укажите ваш адрес электронной почты:', userLanguage));
};

async function handleEmail(msg) {
    const chatId = msg.chat.id;
    const userLanguage = (userInfo[chatId] && userInfo[chatId].language) ? userInfo[chatId].language : defaultLanguage;
    const emailRegex = /^[a-zA-Z0-9._-]{1,}@[a-z]+\.[a-z]+$/;

    if (!emailRegex.test(msg.text)) {
        await bot.sendMessage(chatId, await translateText('Неверный формат email. Пожалуйста, укажите действительный адрес электронной почты:', userLanguage));
    } else {
        expertHelpInfo[chatId] = { description: "Экспертная помощь с недвижимостью", email: msg.text, phone: "", fio: "" };
        userStates[chatId].step = 'awaitingPhone';
        userInfo[chatId].state = 'awaiting_phone';
        saveData('expertHelpInfo', expertHelpInfo);
        saveData('userStates', userStates);
        await bot.sendMessage(chatId, await translateText('Отлично! Теперь, пожалуйста, укажите ваш номер телефона, начиная с символа "+" и кода страны.', userLanguage));
    }
};

async function handlePhone(msg) {
    const chatId = msg.chat.id;
    const userLanguage = (userInfo[chatId] && userInfo[chatId].language) ? userInfo[chatId].language : defaultLanguage;
    const phoneRegex = /^\+\d{6,16}$/;

    if (!phoneRegex.test(msg.text)) {
        await bot.sendMessage(chatId, await translateText('Неверный формат номера телефона. Пожалуйста, укажите действительный номер телефона, начиная с "+" и содержащий только цифры.', userLanguage));
    } else {
        expertHelpInfo[chatId].phone = msg.text;
        userInfo[chatId].state = 'awaiting_fio';
        userStates[chatId].step = 'awaitingFIO';
        saveData('expertHelpInfo', expertHelpInfo);
        saveData('userStates', userStates);
        await bot.sendMessage(chatId, await translateText('Спасибо за информацию о вашем номере телефона! Теперь напишите ваше имя, фамилию и отчество.', userLanguage));
    }
};

async function handleFIO(msg) {
    const chatId = msg.chat.id;
    const userLanguage = (userInfo[chatId] && userInfo[chatId].language) ? userInfo[chatId].language : defaultLanguage;

    expertHelpInfo[chatId].fio = msg.text;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: await translateText("Стратегия аренды", userLanguage), callback_data: "rental_strategy" }],
                [{ text: await translateText("Стратегия перепродажи", userLanguage), callback_data: "resale_strategy" }],
                [{ text: await translateText("Аренда с последующей перепродажей", userLanguage), callback_data: "lease_strategy" }],
                [{ text: await translateText("Просмотреть стартовое сообщение", userLanguage), callback_data: "help_again" }]
            ]
        }
    };

    await bot.sendMessage(chatId, await translateText('Наши консультанты свяжутся с вами в ближайшее время, чтобы обсудить ваши цели и предложить наиболее подходящие варианты инвестиций.\n\n Пока Вы ждете ответа наших консультантов, можете просмотреть другую информацию в нашем боте⬇️', userLanguage), opts);

    await bot.sendMessage(process.env.MANAGER_GROUP,
        `💡 Тема: ${expertHelpInfo[chatId].description}\n📧 Адрес электронной почты: ${expertHelpInfo[chatId].email}\n📱 Номер телефона: ${expertHelpInfo[chatId].phone}\n👨🏻‍💻 ФИО: ${expertHelpInfo[chatId].fio}`);

    delete userStates[chatId];
    delete expertHelpInfo[chatId];
    saveData('expertHelpInfo', expertHelpInfo);
    saveData('userStates', userStates);
};


async function investmentStrategies(msg) {
    userInfo[msg.chat.id].state = 'investment_strategies_start';
    userInfo[msg.chat.id].lastMessageId = msg.message_id;
    saveData('userStates', userStates);
    let userLanguage;
    if (userInfo[msg.chat.id] && userInfo[msg.chat.id].language) {
        userLanguage = defaultLanguage;
    } else {
        userLanguage = userInfo[msg.chat.id].language;
    }
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: await translateText("Стратегия аренды", userLanguage), callback_data: "rental_strategy"
                    }
                ],
                [
                    {
                        text: await translateText("Стратегия перепродажи", userLanguage), callback_data: "resale_strategy"
                    }
                ],
                [
                    {
                        text: await translateText("Аренда с последующей перепродажей", userLanguage), callback_data: "lease_strategy"
                    }
                ]
            ]
        }
    };
    await bot.sendMessage(msg.chat.id, await translateText(
        'Стратегии инвестирования в недвижимость на Бали\n\n' +
        '1. Стратегия аренды\n' +
        '2. Стратегия перепродажи\n' +
        '3. Аренда с последующей перепродажей\n\n' +
        '⬇️Чтобы узнать больше о каждой из этих стратегий, нажмите на кнопку соответствующей стратегии ниже⬇️',
        userLanguage), opts);
}

async function questionnaireForm(msg) {
    try {
        const chatId = msg.chat.id;
        userInfo[chatId].state = 'questionnaire';
        userInfo[chatId].lastMessageId = msg.message_id;
        saveData('userInfo', userInfo);

        userInfo = loadData('userInfo');
        expertHelpInfo = loadData('expertHelpInfo');
        userStates = loadData('userStates');
        questionnaireAnswer = loadData('questionnaireAnswer');

        let userLanguage;
        if (userInfo[chatId] && userInfo[chatId].language) {
            userLanguage = userInfo[chatId].language;
        } else {
            userLanguage = defaultLanguage;
        }

        const questions = [
            {
                text: await translateText("Какова основная цель вашей инвестиции в недвижимость на Бали?", userLanguage),
                options: [
                    await translateText("Для личного проживания", userLanguage),
                    await translateText("Для получения дохода от аренды", userLanguage),
                    await translateText("Для перепродажи с прибылью", userLanguage),
                    await translateText("Другое (пожалуйста, уточните)", userLanguage)
                ],
                customOptionIndex: 3
            },
            {
                text: await translateText("Каким типом недвижимости вы интересуетесь?", userLanguage),
                options: [
                    await translateText("Апартаменты", userLanguage),
                    await translateText("Вилла", userLanguage),
                    await translateText("Земельный участок", userLanguage),
                    await translateText("Коммерческая недвижимость", userLanguage),
                    await translateText("Другое (пожалуйста, уточните)", userLanguage)
                ],
                customOptionIndex: 4
            },
            {
                text: await translateText("Каков ваш бюджет на покупку недвижимости?", userLanguage),
                options: [
                    await translateText("До $100,000", userLanguage),
                    await translateText("$100,000 - $300,000", userLanguage),
                    await translateText("$300,000 - $500,000", userLanguage),
                    await translateText("$500,000 - $1,000,000", userLanguage),
                    await translateText("Более $1,000,000", userLanguage)
                ]
            },
            {
                text: await translateText("В каком районе Бали вы предпочитаете инвестировать?", userLanguage),
                options: [
                    await translateText("Кута", userLanguage),
                    await translateText("Семиньяк", userLanguage),
                    await translateText("Чангу", userLanguage),
                    await translateText("Убуд", userLanguage),
                    await translateText("Джимбаран", userLanguage),
                    await translateText("Другие районы (пожалуйста, уточните)", userLanguage)
                ],
                customOptionIndex: 5
            },
            {
                text: await translateText("Какую ожидаемую доходность или выгоду вы планируете получить от инвестиций в недвижимость на Бали?", userLanguage),
                options: [
                    await translateText("До 5% годовых", userLanguage),
                    await translateText("5-10% годовых", userLanguage),
                    await translateText("10-15% годовых", userLanguage),
                    await translateText("Более 15% годовых", userLanguage),
                    await translateText("Трудно сказать, рассчитываю на вашу помощь в оценке", userLanguage)
                ]
            },
            {
                text: await translateText("Когда вы планируете совершить покупку недвижимости?", userLanguage),
                options: [
                    await translateText("В течение ближайших 3 месяцев", userLanguage),
                    await translateText("В течение 6 месяцев", userLanguage),
                    await translateText("В течение года", userLanguage),
                    await translateText("Более года", userLanguage)
                ]
            },
            {
                text: await translateText("Есть ли у вас какие-либо особые требования или предпочтения к недвижимости, которую вы ищете?", userLanguage),
                options: [
                    await translateText("Да (пожалуйста, уточните)", userLanguage),
                    await translateText("Нет", userLanguage)
                ],
                customOptionIndex: 0
            },
            {
                text: await translateText("Метод оплаты?", userLanguage),
                options: [
                    await translateText("Банковский перевод", userLanguage),
                    await translateText("Криптовалюта", userLanguage),
                    await translateText("Оплата наличными", userLanguage)
                ]
            },
            {
                text: await translateText("Как вы хотели бы произвести оплату?", userLanguage),
                options: [
                    await translateText("Рассрочка", userLanguage),
                    await translateText("Полная сумма", userLanguage)
                ]
            },
            {
                text: await translateText("Пожалуйста, введите ваше полное ФИО:", userLanguage),
                options: []
            },
            {
                text: await translateText("Пожалуйста, введите ваш контактный телефон:", userLanguage),
                options: []
            }
        ];

        if (!userStates[chatId]) {
            userStates[chatId] = { currentQuestionIndex: 0, waitingForDetail: false };
            saveData('userStates', userStates);
        }
        if (!questionnaireAnswer[chatId]) {
            questionnaireAnswer[chatId] = {};
            saveData('questionnaireAnswer', questionnaireAnswer);
        }

        const state = userStates[chatId];

        const sendQuestion = async () => {
            const currentQuestion = questions[state.currentQuestionIndex];
            const opts = currentQuestion.options.length ? {
                reply_markup: {
                    keyboard: currentQuestion.options.map(option => [option]),
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            } : { reply_markup: { remove_keyboard: true } };
            await bot.sendMessage(chatId, currentQuestion.text, opts);
        };

        const handleAnswer = async (msg) => {
            const text = msg.text;
            const currentQuestion = questions[state.currentQuestionIndex];

            if (state.waitingForDetail) {
                questionnaireAnswer[chatId][`question${state.currentQuestionIndex + 1}`] += `: ${text}`;
                state.currentQuestionIndex++;
                state.waitingForDetail = false;
                saveData('questionnaireAnswer', questionnaireAnswer);
                saveData('userStates', userStates);

                if (state.currentQuestionIndex < questions.length) {
                    await sendQuestion();
                } else {
                    await handleEndOfQuestionnaire();
                }
            } else if (currentQuestion.customOptionIndex !== undefined && text === currentQuestion.options[currentQuestion.customOptionIndex]) {
                questionnaireAnswer[chatId][`question${state.currentQuestionIndex + 1}`] = text;
                state.waitingForDetail = true;
                saveData('questionnaireAnswer', questionnaireAnswer);

                await bot.sendMessage(
                    chatId,
                    await translateText("Пожалуйста, опишите ваши особые требования к недвижимости.", userLanguage),
                    { reply_markup: { remove_keyboard: true } }
                );
            } else {
                questionnaireAnswer[chatId][`question${state.currentQuestionIndex + 1}`] = text;
                state.currentQuestionIndex++;
                saveData('questionnaireAnswer', questionnaireAnswer);
                saveData('userStates', userStates);

                if (state.currentQuestionIndex < questions.length) {
                    await sendQuestion();
                } else {
                    await handleEndOfQuestionnaire();
                }
            }
        };

        const handleEndOfQuestionnaire = async () => {
            const answers = questionnaireAnswer[chatId];
            const finalMessage = `<b>📝 Анкета заполнена</b>\n\n` +
                `<b>1. Цель инвестиции:</b> ${answers.question1}\n` +
                `<b>2. Тип недвижимости:</b> ${answers.question2}\n` +
                `<b>3. Бюджет:</b> ${answers.question3}\n` +
                `<b>4. Предпочитаемый район:</b> ${answers.question4}\n` +
                `<b>5. Ожидаемая доходность:</b> ${answers.question5}\n` +
                `<b>6. Время покупки:</b> ${answers.question6}\n` +
                `<b>7. Особые требования:</b> ${answers.question7}\n` +
                `<b>8. Способ оплаты:</b> ${answers.question8}\n` +
                `<b>9. Предпочтение в оплате:</b> ${answers.question9}\n` +
                `<b>Полное ФИО:</b> ${questionnaireAnswer[chatId].question10}\n` +
                `<b>Контактный телефон:</b> ${questionnaireAnswer[chatId].question11}`;

            await bot.sendMessage(process.env.MANAGER_GROUP, finalMessage, { parse_mode: 'HTML' });

            await bot.sendMessage(chatId, await translateText("Спасибо за заполнение анкеты. Мы скоро с вами свяжемся.\n\n Чтобы увидеть стратегии дохода или вернуться к стартовому сообщению нажмите на кнопки ниже", userLanguage), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: await translateText("Стратегия аренды", userLanguage), callback_data: "rental_strategy" }],
                        [{ text: await translateText("Стратегия перепродажи", userLanguage), callback_data: "resale_strategy" }],
                        [{ text: await translateText("Аренда с последующей перепродажей", userLanguage), callback_data: "lease_strategy" }],
                        [{ text: await translateText("Просмотреть стартовое сообщение", userLanguage), callback_data: "help_again" }]
                    ]
                }
            });

            delete questionnaireAnswer[chatId];
            delete userStates[chatId];
            saveData('questionnaireAnswer', questionnaireAnswer);
            saveData('userStates', userStates);

            bot.removeListener('message', handleAnswer);
        };

        bot.removeListener('message', handleAnswer);
        bot.on('message', (msg) => {
            if (msg.chat.id === chatId) handleAnswer(msg);
        });

        await sendQuestion();

    } catch (error) {
        console.log("USER INFO - " + JSON.stringify(userInfo[msg.chat.id]));
        console.log("FORM ERROR MESSAGE - " + error);
    }
}


bot.on('callback_query', async (callbackQuery) => {
    try {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const messageId = msg.message_id;
        const data = callbackQuery.data;

        userInfo = loadData('userInfo');
        expertHelpInfo = loadData('expertHelpInfo');
        userStates = loadData('userStates');
        questionnaireAnswer = loadData('questionnaireAnswer');

        let userLanguage;
        try {
            if (!userInfo[chatId] || !userInfo[chatId].language) {
                userLanguage = defaultLanguage;
            } else {
                userLanguage = userInfo[chatId].language;
            }
            console.log(userLanguage);
        } catch (error) {
            console.log(error);
            userLanguage = defaultLanguage;
        }

        if (data === 'questionnaire') {
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await questionnaireForm(msg);
            } catch (error) {
                console.log("QUESTIONNAIRE - " + error);
            }
        } else if (data === 'expert_help') {
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await startExpertHelp(msg);

            } catch (error) {
                console.log(error);
                await startExpertHelp(msg);
            }
        } else if (data === 'strategies') {
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                investmentStrategies(msg);
            } catch (error) {

            }
        } else if (data === 'rental_strategy') {
            try {
                const opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: await translateText("Стратегия перепродажи", userLanguage), callback_data: "resale_strategy"
                                },
                                {
                                    text: await translateText("Аренда с последующей перепродажей", userLanguage), callback_data: "lease_strategy"
                                }
                            ],
                            [
                                {
                                    text: await translateText("Просмотреть стартовое сообщение", userLanguage), callback_data: "help_again"
                                }
                            ]
                        ]
                    }
                };
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await bot.sendMessage(msg.chat.id, await translateText("<b>1. Стратегия аренды</b>\n\n" +
                    "<b>Описание:</b> Стратегия аренды предполагает покупку недвижимости с целью её последующей сдачи в аренду для получения регулярного дохода. Этот подход подходит для инвесторов, которые ищут стабильный и предсказуемый доход от своего вложения.\n\n" +
                    "<b>Преимущества:</b>\n    • Регулярный поток доходов от аренды.\n    • Возможность увеличения арендной платы в зависимости от рыночных условий.\n    • Недвижимость остается в собственности, что позволяет воспользоваться приростом её стоимости в будущем.\n\n" +
                    "<b>Риски:</b>\n    • Необходимость управления недвижимостью (поиск арендаторов, техническое обслуживание и ремонт).\n    • Возможность временных периодов без арендаторов.\n    • Изменение рыночных условий, которые могут повлиять на уровень арендной платы.\n\n" +
                    "<b>Пример расчета:</b>\n    • Цена апартаментов: $150,000\n    • Дневная арендная плата: $120\n    • Средняя заполняемость: 70% (255 дней в году)\n    • Годовой доход: 255 дней * $120 = $30,600\n    • Годовые расходы на обслуживание (10%): $3,060\n    • Чистый годовой доход: $27,540\n    • Годовая доходность: 18.36%\n\n",
                    userLanguage),
                    opts
                );
            } catch (error) {

            }
        } else if (data === 'resale_strategy') {
            try {
                const opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: await translateText("Стратегия аренды", userLanguage), callback_data: "rental_strategy"
                                },
                                {
                                    text: await translateText("Аренда с последующей перепродажей", userLanguage), callback_data: "lease_strategy"
                                }
                            ],
                            [
                                {
                                    text: await translateText("Просмотреть стартовое сообщение", userLanguage), callback_data: "help_again"
                                }
                            ]
                        ]
                    }
                };
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await bot.sendMessage(msg.chat.id, await translateText("<b>2. Стратегия перепродажи</b>\n\n" +
                    "<b>Описание:</b> Стратегия перепродажи предполагает покупку недвижимости с целью её последующей продажи по более высокой цене. Это подход для инвесторов, которые ищут возможность получения единовременной прибыли от изменения стоимости недвижимости.\n\n" +
                    "<b>Преимущества:</b>\n    • Возможность значительного увеличения капитала при успешной перепродаже.\n    • Нет необходимости в управлении недвижимостью в долгосрочной перспективе.\n\n" +
                    "<b>Риски:</b>\n    • Зависимость от рыночных условий и колебаний цен на недвижимость.\n    • Расходы на продажу (комиссии, налоги и другие сборы).\n    • Возможные временные затраты на продажу недвижимости.\n\n" +
                    "<b>Пример расчета:</b>\n    • Цена апартаментов: $150,000\n    • Ожидаемая цена продажи через год: $172,000\n    • Расходы на продажу (5%): $8,600\n    • Чистый доход от перепродажи: $13,400\n    • Годовая доходность: 8.93%\n\n",
                    userLanguage),
                    opts
                );
            } catch (error) {

            }
        } else if (data === 'lease_strategy') {
            try {
                const opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: await translateText("Стратегия аренды", userLanguage), callback_data: "rental_strategy"
                                },
                                {
                                    text: await translateText("Стратегия перепродажи", userLanguage), callback_data: "resale_strategy"
                                }
                            ],
                            [
                                {
                                    text: await translateText("Просмотреть стартовое сообщение", userLanguage), callback_data: "help_again"
                                }
                            ]
                        ]
                    }
                };
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await bot.sendMessage(msg.chat.id, await translateText("<b>3. Аренда с последующей перепродажей</b>\n\n" +
                    "<b>Описание:</b> Комбинированная стратегия включает в себя сдачу недвижимости в аренду на определенный период с последующей продажей. Этот подход позволяет инвестору получать текущий доход от аренды, а затем извлечь прибыль от прироста стоимости недвижимости.\n\n" +
                    "<b>Преимущества:</b>\n    • Возможность получения двойного дохода: текущего от аренды и капитального от перепродажи.\n    • Более высокая совокупная доходность.\n\n" +
                    "<b>Риски:</b>\n    • Необходимость управления недвижимостью на этапе аренды.\n    • Возможные изменения рыночных условий, которые могут повлиять как на арендную плату, так и на цену продажи.\n    • Расходы на продажу (комиссии, налоги и другие сборы).\n\n" +
                    "<b>Пример расчета:</b>\n    • Цена апартаментов: $150,000\n    • Дневная арендная плата: $120\n    • Средняя заполняемость: 70% (255 дней в году)\n    • Годовой доход от аренды: $27,540\n    • Ожидаемая цена продажи через год: $172,000\n    • Расходы на продажу (5%): $8,600\n    • Чистый доход от перепродажи: $13,400\n    • Совокупный годовой доход: $40,940\n    • Совокупная годовая доходность: 27.29%\n\n",
                    userLanguage),
                    opts
                );
            } catch (error) {
                console.log(error);
            }
        } else if (data === "help_again") {

            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: await translateText("Анкета", userLanguage), callback_data: "questionnaire"
                            }
                        ],
                        [
                            {
                                text: await translateText("Экспертная помощь с недвижимостью", userLanguage), callback_data: "expert_help"
                            }
                        ],
                        [
                            {
                                text: await translateText("О нас", userLanguage), url: 'https://t.me'
                            }
                        ],
                        [
                            {
                                text: await translateText("Стратегии инвестирования", userLanguage), callback_data: "strategies"
                            }
                        ]
                    ]
                }
            };
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.sendMessage(msg.chat.id, await translateText(
                "Приветствуем вас в АН “Condor Real Estates”!\n\n" +
                "Мы рады приветствовать вас в нашем Telegram-боте! Наша инвестиционная компания специализируется на недвижимости на Бали, предоставляя вам уникальные возможности для выгодных вложений в один из самых живописных уголков мира.\n\n" +
                "Мы предлагаем широкий спектр услуг, включая покупку, продажу и аренду недвижимости, а также консультации по инвестициям и управлению объектами. Наши эксперты всегда готовы помочь вам найти наилучшие решения для достижения ваших финансовых целей.\n\n" +
                "С чего вам начать ⁉️\n" +
                "➡️Пройти опрос, чтобы мы смогли подобрать вам варианты недвижимости под ваш запрос и вы наглядно увидели, что можете получить на ваш бюджет.\n➡️Следите за нашими обновлениями, получайте актуальную информацию о новых объектах и специальных предложениях, а также задавайте вопросы — мы всегда на связи и готовы помочь!\n\n" +
                "Спасибо, что выбрали нас. Давайте вместе создадим Ваше успешное будущее на Бали!\n\n" +
                "⬇️Сделайте свой выбор⬇️",
                userLanguage
            ), opts);
        }

        saveData('userInfo', userInfo);
        saveData('expertHelpInfo', expertHelpInfo);
        saveData('userStates', userStates);
        saveData('questionnaireAnswer', questionnaireAnswer);

    } catch (error) {
        console.log("SOME ERROR HERE - " + error);
    }
});

const getUserLanguage = (msg) => {
    const languageCode = msg.from.language_code;
    return languageCode === 'uk' ? 'ru' : languageCode || 'ru';
};

async function translateText(clientText, targetLanguage) {
    try {
        if (targetLanguage === 'ru') return clientText;
        const res = await translate(clientText, { from: 'ru', to: targetLanguage });
        return res.text || clientText;
    } catch (err) {
        console.error('Translation error:', err);
        return clientText;
    }
}

async function restoreUserState(bot, userInfo, chatId) {
    if (!userInfo[chatId] || !userInfo[chatId].state) {
        return;
    }

    const userState = userInfo[chatId].state;

    try {
        switch (userState) {
            case 'questionnaire':
                await bot.sendMessage(chatId, await translateText("Приносим свои извинения, бот снова онлайн, пройдите форму дальше с того момента, где Вы ее закончили, или начните сначала", userInfo[chatId].language),
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: await translateText("Продолжить заполнение анкеты", userInfo[chatId].language), callback_data: "questionnaire" }],
                                [{ text: await translateText("Просмотреть стартовое сообщение", userInfo[chatId].language), callback_data: "help_again" }]
                            ]
                        }
                    }
                );
                break;
            case 'investment_strategies_start':
                await bot.sendMessage(chatId, await translateText("Приносим свои извинения, бот снова онлайн, если вы желаете просмотреть статегии инвестирования, то нажмите на соответствующую кнопку ниже, или начните сначала", userInfo[chatId].language),
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: await translateText("Стратегии инвестирования", userInfo[chatId].language), callback_data: "strategies" }],
                                [{ text: await translateText("Просмотреть стартовое сообщение", userInfo[chatId].language), callback_data: "help_again" }]
                            ]
                        }
                    }
                );
                break;
            case 'awaiting_fio':
            case 'awaiting_phone':
            case 'awaiting_email':
                await bot.sendMessage(chatId, await translateText("Приносим свои извинения, бот снова онлайн, пройдите форму заново еще раз нажав на соответствующую кнопку, или начните сначала", userInfo[chatId].language),
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: await translateText("Экспертная помощь с недвижимостью", userInfo[chatId].language), callback_data: "expert_help" }],
                                [{ text: await translateText("Просмотреть стартовое сообщение", userInfo[chatId].language), callback_data: "help_again" }]
                            ]
                        }
                    }
                );
                break;
            case 'start':
                userInfo = loadData('userInfo');
                expertHelpInfo = loadData('expertHelpInfo');
                userStates = loadData('userStates');
                questionnaireAnswer = loadData('questionnaireAnswer');
                const userLanguage = userInfo[chatId].language;
                console.log(userInfo);
                console.log(userLanguage);
                userInfo[chatId] = {
                    language: userLanguage,
                    state: 'start'
                };

                saveData('userInfo', userInfo);

                const opts = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: await translateText("Анкета", userLanguage), callback_data: "questionnaire"
                                }
                            ],
                            [
                                {
                                    text: await translateText("Экспертная помощь с недвижимостью", userLanguage), callback_data: "expert_help"
                                }
                            ],
                            [
                                {
                                    text: await translateText("О нас", userLanguage), url: 'https://t.me'
                                }
                            ],
                            [
                                {
                                    text: await translateText("Стратегии инвестирования", userLanguage), callback_data: "strategies"
                                }
                            ]
                        ]
                    }
                };

                await bot.sendMessage(chatId, await translateText(
                    "Приветствуем вас в АН “Condor Real Estates”!\n\n" +
                    "Мы рады приветствовать вас в нашем Telegram-боте! Наша инвестиционная компания специализируется на недвижимости на Бали, предоставляя вам уникальные возможности для выгодных вложений в один из самых живописных уголков мира.\n\n" +
                    "Мы предлагаем широкий спектр услуг, включая покупку, продажу и аренду недвижимости, а также консультации по инвестициям и управлению объектами. Наши эксперты всегда готовы помочь вам найти наилучшие решения для достижения ваших финансовых целей.\n\n" +
                    "С чего вам начать ⁉️\n" +
                    "➡️Пройти опрос, чтобы мы смогли подобрать вам варианты недвижимости под ваш запрос и вы наглядно увидели, что можете получить на ваш бюджет.\n➡️Следите за нашими обновлениями, получайте актуальную информацию о новых объектах и специальных предложениях, а также задавайте вопросы — мы всегда на связи и готовы помочь!\n\n" +
                    "Спасибо, что выбрали нас. Давайте вместе создадим Ваше успешное будущее на Бали!\n\n" +
                    "⬇️Сделайте свой выбор⬇️",
                    userLanguage
                ), opts);
                break;
            default:
                console.log(`Неизвестное состояние для chatId ${chatId}: ${userState}`);
        }
    } catch (error) {
        console.log(`Ошибка при восстановлении состояния пользователя ${chatId}: ${error.message}`);
    }
}