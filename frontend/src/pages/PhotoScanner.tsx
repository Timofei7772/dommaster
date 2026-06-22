import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { Link } from 'react-router-dom';
import {
  Camera,
  Upload,
  FileText,
  MapPin,
  Zap,
  CheckCircle,
  AlertCircle,
  X,
  Plus,
  Building2,
  User,
  Sparkles,
  Calculator,
  FileDown,
  Loader2,
  Image as ImageIcon,
  Mic,
  MicOff,
  Send,
  Key,
  Settings,
  AlertTriangle,
  Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { aiApi, estimatesApi } from '@/lib/api';
import { searchWorks } from '@/lib/catalog';
import toast from 'react-hot-toast';

interface RecognizedItem {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  price?: number;
  matched_work_id?: number;
  master_price?: number;
  company_price?: number;
  master_total?: number;
  company_total?: number;
}

interface ScanResult {
  success: boolean;
  items: RecognizedItem[];
  detected_city?: string;
  raw_text?: string;
  detected_text?: string;  // Распознанный текст с фото
  total_items: number;
  message: string;
}

// Все регионы РФ сгруппированные по федеральным округам
const REGIONS = {
  'Центральный ФО': [
    'Москва', 'Московская область', 'Белгородская область', 'Брянская область',
    'Владимирская область', 'Воронежская область', 'Ивановская область',
    'Калужская область', 'Костромская область', 'Курская область',
    'Липецкая область', 'Орловская область', 'Рязанская область',
    'Смоленская область', 'Тамбовская область', 'Тверская область',
    'Тульская область', 'Ярославская область'
  ],
  'Северо-Западный ФО': [
    'Санкт-Петербург', 'Ленинградская область', 'Архангельская область',
    'Вологодская область', 'Калининградская область', 'Карелия',
    'Коми', 'Мурманская область', 'Ненецкий АО', 'Новгородская область', 'Псковская область'
  ],
  'Южный ФО': [
    'Ростовская область', 'Краснодарский край', 'Волгоградская область',
    'Астраханская область', 'Адыгея', 'Калмыкия', 'Крым', 'Севастополь'
  ],
  'Северо-Кавказский ФО': [
    'Ставропольский край', 'Дагестан', 'Ингушетия', 'Кабардино-Балкария',
    'Карачаево-Черкесия', 'Северная Осетия', 'Чечня'
  ],
  'Приволжский ФО': [
    'Нижегородская область', 'Самарская область', 'Татарстан', 'Башкортостан',
    'Пермский край', 'Саратовская область', 'Оренбургская область',
    'Ульяновская область', 'Пензенская область', 'Кировская область',
    'Чувашия', 'Марий Эл', 'Мордовия', 'Удмуртия'
  ],
  'Уральский ФО': [
    'Свердловская область', 'Челябинская область', 'Тюменская область',
    'Курганская область', 'ХМАО', 'ЯНАО'
  ],
  'Сибирский ФО': [
    'Новосибирская область', 'Красноярский край', 'Омская область',
    'Кемеровская область', 'Иркутская область', 'Алтайский край',
    'Томская область', 'Забайкальский край', 'Бурятия', 'Алтай',
    'Тыва', 'Хакасия'
  ],
  'Дальневосточный ФО': [
    'Приморский край', 'Хабаровский край', 'Сахалинская область',
    'Амурская область', 'Камчатский край', 'Магаданская область',
    'Якутия', 'Еврейская АО', 'Чукотский АО'
  ]
};


export const PhotoScanner: React.FC = () => {
  const [mode, setMode] = useState<'photo' | 'text' | 'voice'>('photo');
  const [selectedCity, setSelectedCity] = useState<string>('Москва');
  const [clientName, setClientName] = useState<string>('');
  const navigate = useNavigate();
  const { settings } = useSettings();
  const hasApiKey = !!settings.integrations?.geminiApiKey;

  // Состояния загрузки
  const [isScanning, setIsScanning] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);

  // Результаты
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [, setPriceComparison] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);

  // Текстовый ввод
  const [textInput, setTextInput] = useState('');

  // Голосовой ввод
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const speechRecognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Предпросмотр изображения
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Обработка фото через AI
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Валидация размера файла (макс 10 МБ)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Файл слишком большой. Максимум 10 МБ.');
      return;
    }

    // Показываем превью
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreviewUrl(base64);

      if (!hasApiKey) {
        toast.error('Настройте API ключ в разделе Настройки → Интеграции');
        return;
      }

      setIsScanning(true);
      setScanResult(null);

      try {
        // Используем локальный AI API
        const result = await aiApi.analyzePhoto(base64);
        console.log('AI Result:', result);
        if (result.data) {
          const itemsCount = result.data.items?.length || 0;
          const rawText = result.data.rawText || '';
          const description = result.data.description || '';
          
          // Проверяем, не является ли rawText сообщением об ошибке
          const isError = rawText.includes('лимит') || rawText.includes('ошибка') || 
                         rawText.includes('Превышен') || rawText.includes('API') ||
                         description.includes('лимит') || description.includes('Превышен');
          
          if (isError) {
            setScanResult({
              success: false,
              items: [],
              total_items: 0,
              message: rawText || description || 'Ошибка API',
              raw_text: '',
              detected_text: ''
            });
            toast.error(rawText || description || 'Ошибка API. Подождите минуту.');
          } else {
            setScanResult({
              success: true,
              items: result.data.items || [],
              total_items: itemsCount,
              message: itemsCount > 0 
                ? 'Распознано ' + itemsCount + ' позиций'
                : 'Текст распознан, но позиции не найдены',
              detected_city: result.data.detectedCity,
              raw_text: rawText,
              detected_text: rawText
            });
            
            if (itemsCount > 0) {
              toast.success('Фото успешно распознано! ' + itemsCount + ' позиций');
            } else if (rawText) {
              toast.success('Текст распознан. Проверьте результат ниже.');
            }
          }
        }
      } catch (error: any) {
        const errorMsg = error?.message || 'Неизвестная ошибка';
        setScanResult({
          success: false,
          items: [],
          total_items: 0,
          message: errorMsg,
          raw_text: error?.message
        });
        toast.error(errorMsg);
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Обработка текста через AI
  const handleTextScan = async () => {
    if (!textInput.trim()) return;

    setIsScanning(true);
    setScanResult(null);

    // Сначала пробуем локальный парсинг (без API)
    const localItems = parseTextLocally(textInput);
    
    if (localItems.length > 0) {
      // Локальный парсинг успешен!
      setScanResult({
        success: true,
        items: localItems,
        total_items: localItems.length,
        message: 'Распознано ' + localItems.length + ' позиций',
        detected_text: textInput
      });
      toast.success('Распознано ' + localItems.length + ' позиций!');
      setIsScanning(false);
      return;
    }

    // Если локально не получилось и есть API - пробуем через AI
    if (hasApiKey) {
      try {
        const result = await aiApi.generateEstimateItems(textInput, selectedCity);
        if (result.data && result.data.items?.length > 0) {
          setScanResult({
            success: true,
            items: result.data.items || [],
            total_items: result.data.items?.length || 0,
            message: 'Распознано ' + (result.data.items?.length || 0) + ' позиций'
          });
          toast.success('Текст успешно распознан!');
          setIsScanning(false);
          return;
        }
      } catch {
        console.log('AI API error, using local parsing');
      }
    }

    // Fallback: добавляем каждую строку как отдельную работу
    const lines = textInput.split('\n').filter(l => l.trim());
    const fallbackItems = lines.map((line) => ({
      name: line.trim(),
      unit: 'шт',
      quantity: 1,
      price: 0,
      confidence: 0.5
    }));

    setScanResult({
      success: true,
      items: fallbackItems,
      total_items: fallbackItems.length,
      message: 'Добавлено ' + fallbackItems.length + ' позиций (требуется уточнение)',
      detected_text: textInput
    });
    toast.success('Добавлено ' + fallbackItems.length + ' позиций');
    setIsScanning(false);
  };

  // Локальный парсер текста с поиском по базе работ
  const parseTextLocally = (text: string): RecognizedItem[] => {
    const items: RecognizedItem[] = [];
    
    // Разбиваем по строкам, запятым и точкам с запятой
    const lines = text
      .split(/[\n,;]+/)
      .map(l => l.trim())
      .filter(l => l.length > 2);

    // Словарь числительных
    const wordToNum: Record<string, number> = {
      'один': 1, 'одна': 1, 'одно': 1,
      'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
      'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
      'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
      'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18,
      'девятнадцать': 19, 'двадцать': 20, 'тридцать': 30, 'сорок': 40,
      'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80,
      'девяносто': 90, 'сто': 100, 'двести': 200, 'триста': 300
    };
    
    // Ключевые слова для поиска в базе
    const workKeywords: Record<string, string[]> = {
      'штукатур': ['штукатурка', 'оштукатуривание', 'штукатурные'],
      'плит': ['плитка', 'кафель', 'керамогранит', 'облицовка'],
      'розет': ['розетка', 'электроточка', 'электрика'],
      'выключ': ['выключатель', 'электроточка'],
      'потолок': ['потолок', 'натяжной', 'подвесной', 'гипсокартон'],
      'стяж': ['стяжка', 'пол', 'выравнивание'],
      'ламинат': ['ламинат', 'паркет', 'напольное'],
      'обо': ['обои', 'поклейка', 'оклейка'],
      'покрас': ['покраска', 'окраска', 'малярные'],
      'шпакл': ['шпаклевка', 'шпатлевка', 'выравнивание'],
      'гипс': ['гипсокартон', 'ГКЛ', 'перегородка'],
      'сантех': ['сантехника', 'унитаз', 'раковина', 'ванна'],
      'труб': ['трубы', 'водопровод', 'канализация'],
      'провод': ['проводка', 'электрика', 'кабель'],
      'дверь': ['дверь', 'двери', 'дверной'],
      'окно': ['окно', 'окна', 'оконный'],
      'балкон': ['балкон', 'лоджия'],
      'демонтаж': ['демонтаж', 'снос', 'разборка'],
      'вывоз': ['вывоз', 'мусор', 'утилизация']
    };

    for (let line of lines) {
      const lineLower = line.toLowerCase();
      
      // Заменяем числительные на цифры
      for (const [word, num] of Object.entries(wordToNum)) {
        line = line.replace(new RegExp('\\b' + word + '\\b', 'gi'), String(num));
      }
      
      // Извлекаем число и единицу измерения если есть
      let quantity = 1;
      let unit = '';
      const numMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(м2|м²|кв\.?\s*м|квадрат|м\.п\.|метр|шт|штук|компл|точ|точек)?/i);
      if (numMatch) {
        quantity = parseFloat(numMatch[1].replace(',', '.')) || 1;
        unit = numMatch[2]?.toLowerCase() || '';
      }
      
      // Нормализация единиц
      if (unit.includes('м2') || unit.includes('м²') || unit.includes('кв') || unit.includes('квадрат')) unit = 'м²';
      else if (unit.includes('м.п') || unit === 'м' || unit.includes('метр')) unit = 'м.п.';
      else if (unit.includes('шт') || unit.includes('штук')) unit = 'шт';
      else if (unit.includes('компл')) unit = 'компл.';
      else if (unit.includes('точ')) unit = 'точка';
      
      // Ищем работу в базе по ключевым словам
      let foundWork = null;
      let bestScore = 0;
      
      for (const [keyword, synonyms] of Object.entries(workKeywords)) {
        if (lineLower.includes(keyword) || synonyms.some(s => lineLower.includes(s.toLowerCase()))) {
          // Нашли ключевое слово, ищем работу в базе
          const searchResults = searchWorks(keyword);
          if (searchResults.length > 0) {
            // Берём первую работу из базы
            const work = searchResults[0];
            const score = 1;
            if (score > bestScore) {
              bestScore = score;
              foundWork = work;
            }
          }
        }
      }
      
      // Если не нашли по ключевым словам - прямой поиск
      if (!foundWork) {
        // Берём слова из строки для поиска
        const searchTerms = lineLower
          .replace(/\d+/g, '')
          .replace(/[^\wа-яё\s]/gi, '')
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 3);
        
        for (const term of searchTerms) {
          const results = searchWorks(term);
          if (results.length > 0) {
            foundWork = results[0];
            break;
          }
        }
      }
      
      if (foundWork) {
        // Нашли работу в базе!
        const workPrice = (foundWork.labor_price || 0) + (foundWork.material_price || 0);
        items.push({
          name: foundWork.name,
          unit: unit || foundWork.unit || 'м²',
          quantity: quantity,
          price: workPrice,
          master_price: workPrice,
          company_price: Math.round(workPrice * 1.5),
          confidence: 0.95,
          matched_work_id: foundWork.id
        });
      } else if (line.trim().length > 2) {
        // Не нашли - добавляем как есть с предупреждением
        items.push({
          name: line.replace(/\d+/g, '').trim() || line.trim(),
          unit: unit || 'шт',
          quantity: quantity,
          price: 0,
          confidence: 0.5
        });
      }
    }

    return items;
  };

  // Расчёт цен
  const calculatePrices = async () => {
    if (!scanResult?.items.length) return;

    setIsCalculating(true);

    try {
      const result = await aiApi.suggestPrices(scanResult.items, selectedCity);
      if (result.data) {
        setPriceComparison(result.data);
        toast.success('Цены рассчитаны!');
      }
    } catch {
      toast.error('Ошибка расчёта цен');
    } finally {
      setIsCalculating(false);
    }
  };

  // Генерация КП
  const generateProposal = async () => {
    if (!scanResult?.items.length) return;

    setIsGeneratingProposal(true);

    // Создаём КП на основе данных
    const masterTotal = scanResult.items.reduce((sum, i) => sum + (i.master_total || i.quantity * (i.master_price || 500)), 0);
    const companyTotal = scanResult.items.reduce((sum, i) => sum + (i.company_total || i.quantity * (i.company_price || 800)), 0);

    setTimeout(() => {
      setProposal({
        id: 'KP-' + Date.now(),
        created_at: new Date().toISOString(),
        city: selectedCity,
        client_name: clientName || 'Клиент',
        items: scanResult.items,
        master_total: masterTotal,
        master_with_overhead: Math.round(masterTotal * 1.15),
        master_with_vat: Math.round(masterTotal * 1.15 * 1.2),
        company_total: companyTotal,
        company_with_overhead: Math.round(companyTotal * 1.25),
        company_with_vat: Math.round(companyTotal * 1.25 * 1.2),
        savings_amount: companyTotal - masterTotal,
        savings_percent: Math.round((1 - masterTotal / companyTotal) * 100),
        recommendation: 'Рекомендуем работать с частным мастером — экономия до ' + Math.round((1 - masterTotal / companyTotal) * 100) + '%'
      });
      setIsGeneratingProposal(false);
      toast.success('КП создано!');
    }, 1000);
  };

  const toggleVoiceRecording = async () => {
    // Используем MediaRecorder для записи аудио, затем Gemini для транскрипции
    
    if (isRecording) {
      // Останавливаем запись
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      toast.success('Обработка записи...');
      return;
    }

    // Проверяем API ключ
    if (!hasApiKey) {
      toast.error('Для голосового ввода нужен API ключ. Настройте в разделе Настройки');
      return;
    }

    try {
      // Запрашиваем доступ к микрофону
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Останавливаем все треки
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length === 0) {
          toast.error('Запись пуста');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Конвертируем в base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          
          setIsTranscribing(true);
          try {
            // Пробуем разные модели Gemini
            const apiKey = settings.integrations?.geminiApiKey;
            const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
            
            let lastError = null;
            for (const model of models) {
              try {
                const response = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{
                        parts: [
                          {
                            inlineData: {
                              mimeType: 'audio/webm',
                              data: base64Audio
                            }
                          },
                          {
                            text: 'Транскрибируй эту аудиозапись на русском языке. Верни ТОЛЬКО текст того, что было сказано, без комментариев.'
                          }
                        ]
                      }]
                    })
                  }
                );

                const data = await response.json();
                
                if (data.error) {
                  // Если квота - пробуем следующую модель
                  if (data.error.message?.includes('quota') || data.error.message?.includes('429')) {
                    lastError = data.error.message;
                    continue;
                  }
                  throw new Error(data.error.message || 'Ошибка API');
                }

                const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                if (transcript.trim()) {
                  setVoiceTranscript(prev => prev ? prev + ' ' + transcript.trim() : transcript.trim());
                  toast.success('Речь распознана!');
                  return; // Успех - выходим
                }
              } catch (e: any) {
                lastError = e.message;
                continue;
              }
            }
            
            // Все модели исчерпаны
            if (lastError?.includes('quota') || lastError?.includes('exceeded')) {
              toast.error('Лимит API исчерпан. Используйте режим "Текст" или подождите час', { duration: 5000 });
            } else {
              toast.error('Не удалось распознать речь');
            }
          } catch (error: any) {
            console.error('Transcription error:', error);
            toast.error('Ошибка распознавания: ' + (error.message || 'Неизвестная ошибка'));
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success('🎤 Говорите... (нажмите снова чтобы остановить)');

    } catch (error: any) {
      console.error('Microphone error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Разрешите доступ к микрофону');
      } else {
        toast.error('Не удалось получить доступ к микрофону');
      }
    }
  };

  // Обработка голосового текста
  const handleVoiceScan = async () => {
    if (!voiceTranscript.trim()) {
      toast.error('Сначала надиктуйте текст');
      return;
    }

    // Используем локальный парсер (тот же что для текста)
    const localItems = parseTextLocally(voiceTranscript);
    
    if (localItems.length > 0) {
      setScanResult({
        success: true,
        items: localItems,
        total_items: localItems.length,
        message: 'Распознано ' + localItems.length + ' позиций из голоса',
        detected_text: voiceTranscript
      });
      toast.success('Распознано ' + localItems.length + ' позиций!');
    } else {
      // Fallback: каждое предложение как отдельная работа
      const lines = voiceTranscript.split(/[.,;!?\n]+/).filter(l => l.trim().length > 3);
      const items = lines.map((line) => ({
        name: line.trim().charAt(0).toUpperCase() + line.trim().slice(1),
        unit: 'шт',
        quantity: 1,
        price: 0,
        confidence: 0.5
      }));

      setScanResult({
        success: true,
        items: items,
        total_items: items.length,
        message: 'Добавлено ' + items.length + ' позиций (требуется уточнение)',
        detected_text: voiceTranscript
      });
      toast.success('Добавлено ' + items.length + ' позиций!');
    }
  };

  // Очистка голосового текста
  const clearVoiceTranscript = () => {
    setVoiceTranscript('');
  };

  // Остановка записи при размонтировании
  useEffect(() => {
    const recognition = speechRecognitionRef.current;
    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, []);

  const addToEstimate = async () => {
    if (!scanResult?.items.length) return;

    try {
      // 1. Формируем позиции сметы
      const estimateItems = scanResult.items.map(item => {
        const masterPrice = item.master_price || 0;
        const markup = 50; // Стандартная наценка
        const clientPrice = Math.round(masterPrice * (1 + markup / 100));

        return {
          id: Date.now() + Math.random(),
          type: 'work',
          name: item.name,
          unit: item.unit || 'шт',
          quantity: item.quantity || 1,
          masterPrice,
          markup,
          clientPrice,
          total: clientPrice * (item.quantity || 1)
        }
      });

      // 2. Данные сметы
      const estimateName = `Смета по фото от ${new Date().toLocaleDateString()}`;
      const estimateData = {
        name: estimateName,
        number: 'СМ-' + Date.now().toString().slice(-6),
        project_id: 1
      };

      // 3. Создаем в БД (API)
      let estimateId = Date.now();
      try {
        const res = await estimatesApi.create({
          ...estimateData,
          client_name: clientName || '',
          address: selectedCity || '',
          status: 'draft'
        });

        if (res?.data?.id) {
          estimateId = res.data.id;

          // Сохраняем позиции
          await Promise.all(estimateItems.map(item => {
            return estimatesApi.addItem(estimateId, {
              name: item.name,
              unit: item.unit,
              quantity: item.quantity,
              materials_cost: item.masterPrice * 0.4, // Примерное распределение если не знаем точно
              labor_cost: item.masterPrice * 0.6,
              code: 'scanned'
            })
          }));

          toast.success('Смета создана! Переходим...');
          navigate(`/estimates/${estimateId}`);
          return;
        }
      } catch (e) {
        console.warn('API unavailable, saving locally', e);
      }

      // Fallback: LocalStorage
      const fullEstimate = {
        id: estimateId,
        ...estimateData,
        client: clientName || 'Клиент',
        address: selectedCity,
        items: estimateItems,
        totalCost: estimateItems.reduce((sum, i) => sum + (i.masterPrice * i.quantity), 0),
        totalPrice: estimateItems.reduce((sum, i) => sum + i.total, 0),
        createdAt: new Date().toISOString()
      };

      // Сохраняем в LocalStorage для надежности (как в CreateEstimate)
      const estimates = JSON.parse(localStorage.getItem('zaru_estimates') || '[]');
      estimates.push(fullEstimate);
      localStorage.setItem('zaru_estimates', JSON.stringify(estimates));

      toast.success('Смета создана! Переходим...');
      navigate(`/estimates/${estimateId}`);

    } catch (error) {
      console.error(error);
      toast.error('Ошибка при создании сметы');
    }
  };

  const clearAll = () => {
    setScanResult(null);
    setPriceComparison(null);
    setProposal(null);
    setPreviewUrl(null);
    setTextInput('');
    setVoiceTranscript('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Сканер смет</h1>
              <p className="text-gray-500 dark:text-gray-400">Фото → Смета за секунды</p>
            </div>
          </div>
          <Link
            to="/settings"
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            <Settings className="w-4 h-4" />
            Настройки
          </Link>
        </div>

        {/* Баннер API ключа */}
        {!hasApiKey && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
                <Key className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Для работы сканера нужен API ключ
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  AI-распознавание требует Gemini API ключ. Получите бесплатный ключ за 1 минуту!
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    <Key className="w-4 h-4" />
                    Ввести API ключ
                  </Link>
                  <a
                    href="https://makersuite.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-50 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    Получить бесплатный ключ →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasApiKey && (
          <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">API ключ настроен — сканер готов к работе!</span>
            </div>
          </div>
        )}

        {/* Выбор режима */}
        <div className="flex justify-center gap-2 mb-6">
          {[
            { id: 'photo', icon: Camera, label: 'Фото', hint: 'Нужен API' },
            { id: 'text', icon: FileText, label: 'Текст', hint: 'Бесплатно' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={"flex flex-col items-center gap-1 px-5 py-3 rounded-xl font-medium transition-all " +
                (mode === m.id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900'
                  : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 border dark:border-slate-700'
                )}
            >
              <div className="flex items-center gap-2">
                <m.icon className="w-5 h-5" />
                {m.label}
              </div>
              <span className={"text-xs " + (mode === m.id ? 'text-violet-200' : 'text-gray-400')}>{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка - Ввод */}
          <div className="lg:col-span-1 space-y-4">
            {/* Выбор региона */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                <MapPin className="w-4 h-4 text-violet-500" />
                Регион для расчёта цен
              </label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              >
                <option value="РФ (средний)">🇷🇺 РФ (средний)</option>
                {Object.entries(REGIONS).map(([district, regions]) => (
                  <optgroup key={district} label={district}>
                    {regions.map(region => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Имя клиента */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                <User className="w-4 h-4 text-violet-500" />
                Имя клиента (для КП)
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              />
            </div>

            {/* Зона ввода */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border dark:border-slate-700">
              {mode === 'photo' && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {previewUrl ? (
                    <div className="relative">
                      <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                      <button
                        onClick={() => { setPreviewUrl(null); clearAll(); }}
                        className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-violet-200 dark:border-violet-800 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-all"
                    >
                      <div className="w-16 h-16 mx-auto mb-4 bg-violet-100 dark:bg-violet-900/50 rounded-2xl flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-violet-500" />
                      </div>
                      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Загрузите фото сметы</p>
                      <p className="text-sm text-gray-500">Рукописная или печатная</p>
                    </div>
                  )}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanning || !hasApiKey}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Распознаём...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Загрузить фото
                      </>
                    )}
                  </button>
                </div>
              )}

              {mode === 'text' && (
                <div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={"Перечислите работы (можно без количества):\n\nПример:\nштукатурка\nплитка в ванной\nрозетки, выключатели\nпотолок натяжной\nстяжка пола\nпоклейка обоев"}
                    rows={8}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all resize-none"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Search className="w-3 h-3" />
                    Программа найдёт работы в базе автоматически. Количество можно указать позже.
                  </p>
                  <button
                    onClick={handleTextScan}
                    disabled={isScanning || !textInput.trim()}
                    className="w-full mt-3 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ищем в базе...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Найти работы в базе
                      </>
                    )}
                  </button>
                </div>
              )}

              {mode === 'voice' && (
                <div className="text-center py-4">
                  <button
                    onClick={toggleVoiceRecording}
                    disabled={false}
                    className={"w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all disabled:opacity-50 " +
                      (isRecording
                        ? 'bg-red-500 animate-pulse shadow-lg shadow-red-200'
                        : 'bg-gradient-to-br from-violet-500 to-purple-600 hover:shadow-lg'
                      )}
                  >
                    {isRecording ? (
                      <MicOff className="w-10 h-10 text-white" />
                    ) : (
                      <Mic className="w-10 h-10 text-white" />
                    )}
                  </button>
                  <p className="mt-4 text-gray-600 dark:text-gray-400">
                    {isTranscribing ? '⏳ Распознаём...' : isRecording ? '🔴 Запись... Нажмите для остановки' : 'Нажмите и говорите'}
                  </p>

                  {/* Показываем распознанный текст */}
                  {voiceTranscript && (
                    <div className="mt-4 text-left">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Распознанный текст:</span>
                        <button
                          onClick={clearVoiceTranscript}
                          className="text-sm text-red-500 hover:text-red-600"
                        >
                          Очистить
                        </button>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-gray-800 dark:text-gray-200 text-sm min-h-[60px] max-h-32 overflow-y-auto">
                        {voiceTranscript}
                      </div>
                      <button
                        onClick={handleVoiceScan}
                        disabled={isScanning || !voiceTranscript.trim()}
                        className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Анализируем...
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            Распознать работы
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!voiceTranscript && (
                    <p className="text-sm text-gray-400 mt-2">
                      «Штукатурка пятьдесят квадратов, плитка в ванной...»
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка - Результаты */}
          <div className="lg:col-span-2 space-y-4">
            {/* Результаты сканирования */}
            {scanResult && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {scanResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    {scanResult.message}
                  </h3>
                  <button onClick={clearAll} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Распознанный текст с фото - показываем ВСЕГДА */}
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">📝 Распознанный текст с фото:</span>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-600 font-mono leading-relaxed">
                    {scanResult.detected_text || scanResult.raw_text || scanResult.message || 'Текст не распознан'}
                  </div>
                  {(scanResult.detected_text || scanResult.raw_text) && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                      <span>💡</span>
                      <span>
                        Проверьте распознанный текст. Если что-то не верно — скопируйте текст, 
                        переключитесь в режим <strong>"Текст"</strong> и отредактируйте вручную.
                      </span>
                    </div>
                  )}
                </div>

                {scanResult.items.length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {scanResult.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {item.quantity} {item.unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="w-20 h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full" style={{ width: (item.confidence || 0.9) * 100 + '%' }} />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{Math.round((item.confidence || 0.9) * 100)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={calculatePrices}
                    disabled={isCalculating || !scanResult.items.length}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-all disabled:opacity-50"
                  >
                    {isCalculating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calculator className="w-5 h-5" />}
                    Цены
                  </button>
                  <button
                    onClick={addToEstimate}
                    disabled={!scanResult.items.length}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    <Plus className="w-5 h-5" />
                    Создать смету
                  </button>
                  <button
                    onClick={generateProposal}
                    disabled={isGeneratingProposal || !scanResult.items.length}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50"
                  >
                    {isGeneratingProposal ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                    КП
                  </button>
                </div>
              </div>
            )}

            {/* КП */}
            {proposal && (
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="w-6 h-6" />
                    Коммерческое предложение
                  </h3>
                  <span className="text-sm opacity-80">{new Date(proposal.created_at).toLocaleDateString('ru')}</span>
                </div>

                {proposal.client_name && <p className="text-violet-100 mb-4">Клиент: {proposal.client_name}</p>}

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-violet-200">
                      <User className="w-4 h-4" />
                      <span className="text-sm">Частный мастер</span>
                    </div>
                    <p className="text-2xl font-bold">{proposal.master_with_vat.toLocaleString('ru')} ₽</p>
                    <p className="text-sm text-violet-200">с НДС и накладными</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-violet-200">
                      <Building2 className="w-4 h-4" />
                      <span className="text-sm">Строительная фирма</span>
                    </div>
                    <p className="text-2xl font-bold">{proposal.company_with_vat.toLocaleString('ru')} ₽</p>
                    <p className="text-sm text-violet-200">с НДС и накладными</p>
                  </div>
                </div>

                <div className="bg-white/20 backdrop-blur rounded-xl p-4 mb-4">
                  <p className="text-lg">{proposal.recommendation}</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={addToEstimate} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-violet-600 font-medium rounded-xl hover:bg-violet-50 transition-all">
                    <Plus className="w-5 h-5" />
                    Добавить в смету
                  </button>
                  <button className="flex items-center justify-center gap-2 py-3 px-5 bg-white/20 backdrop-blur font-medium rounded-xl hover:bg-white/30 transition-all">
                    <FileDown className="w-5 h-5" />
                    PDF
                  </button>
                </div>
              </div>
            )}

            {/* Пустое состояние */}
            {!scanResult && !isScanning && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 shadow-sm border dark:border-slate-700 text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/50 rounded-3xl flex items-center justify-center">
                  <Zap className="w-10 h-10 text-violet-500" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Быстрое создание сметы</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  Загрузите фото сметы, введите текст или надиктуйте — AI автоматически распознает все работы и рассчитает цены для вашего города.
                </p>

                <div className="grid grid-cols-3 gap-4 mt-8">
                  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <Camera className="w-8 h-8 mx-auto mb-2 text-violet-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Фото сметы</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-violet-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Текстовое описание</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <Mic className="w-8 h-8 mx-auto mb-2 text-violet-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Голосовой ввод</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoScanner;








