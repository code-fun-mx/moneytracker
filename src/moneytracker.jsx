import React, { useState, useEffect } from 'react';
import { Plus, X, TrendingUp, List, DollarSign, Trash2, Calendar, Settings } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from './supabase';

export default function AllowanceTracker() {
    const [currentPage, setCurrentPage] = useState('allowance');
    const [containers, setContainers] = useState([]);
    const [records, setRecords] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', amount: '', buttonCount: '' });
    const [analysisView, setAnalysisView] = useState('weekly');
    const [showPaydaySettings, setShowPaydaySettings] = useState(false);
    const [paydaySettings, setPaydaySettings] = useState({ type: 'monthly', day: 1 });
    const [pressedButtons, setPressedButtons] = useState({});
    const [lastPaymentReset, setLastPaymentReset] = useState(null);
    const [paymentCompleted, setPaymentCompleted] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [showOtherForm, setShowOtherForm] = useState(false);
    const [otherData, setOtherData] = useState({ amount: '', source: '' });
    const [loaded, setLoaded] = useState(false);

    // ─── 불러오기 ──────────────────────────────────────────────────
    useEffect(() => {
    const load = async () => {
        try {
        const [{ data: ctrs }, { data: recs }, { data: sets }] = await Promise.all([
            supabase.from('containers').select('*').order('created_at'),
            supabase.from('records').select('*').order('date', { ascending: false }),
            supabase.from('settings').select('*'),
        ]);
        setContainers((ctrs || []).map(c => ({
            id: c.id, name: c.name, amount: c.amount, buttonCount: c.button_count
        })));
        setRecords((recs || []).map(r => ({
            id: r.id, name: r.name, amount: r.amount,
            button_number: r.button_number, container_id: r.container_id,
            type: r.type, date: r.date
        })));
        (sets || []).forEach(s => {
            if (s.key === 'paydaySettings')   setPaydaySettings(JSON.parse(s.value));
            if (s.key === 'lastPaymentReset') setLastPaymentReset(s.value);
            if (s.key === 'pressedButtons')   setPressedButtons(JSON.parse(s.value));
            if (s.key === 'paymentCompleted') setPaymentCompleted(s.value === 'true');
        });
        } catch (e) { console.error('로드 에러:', e); }
        setLoaded(true);
    };
    load();
    }, []);

    // 날짜 바뀌면 지급완료 초기화
    useEffect(() => {
    if (!loaded) return;
    const today = new Date().toDateString();
    const last = localStorage.getItem('lastCheckDate');
    if (last && last !== today) {
        setPaymentCompleted(false);
        saveSetting('paymentCompleted', 'false');
    }
    localStorage.setItem('lastCheckDate', today);
    }, [loaded]);

    // ─── 설정 저장 헬퍼 ────────────────────────────────────────────
    const saveSetting = async (key, value) => {
    const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const { error } = await supabase.from('settings').upsert({ key, value: v });
    if (error) console.error('설정 저장 에러:', error);
    };

    // ─── 컨테이너 추가 ─────────────────────────────────────────────
    const addContainer = async () => {
    if (!formData.name || !formData.amount || !formData.buttonCount) return;
    const newC = {
        id: Date.now(),
        name: formData.name,
        amount: parseInt(formData.amount),
        button_count: parseInt(formData.buttonCount),
    };
    const { error } = await supabase.from('containers').insert(newC);
    if (error) { console.error('컨테이너 추가 에러:', error); return; }
    setContainers(prev => [...prev, {
        id: newC.id, name: newC.name,
        amount: newC.amount, buttonCount: newC.button_count
    }]);
    setFormData({ name: '', amount: '', buttonCount: '' });
    setShowAddForm(false);
    };

    // ─── 컨테이너 삭제 ─────────────────────────────────────────────
    const deleteContainer = async (id) => {
    const { error } = await supabase.from('containers').delete().eq('id', id);
    if (error) { console.error('컨테이너 삭제 에러:', error); return; }
    setContainers(prev => prev.filter(c => c.id !== id));
    };

    // ─── 버튼 클릭 ─────────────────────────────────────────────────
    const handleButtonClick = async (containerName, amount, buttonNumber, containerId, buttonCount) => {
    const bk = `${containerId}-${buttonNumber}`;

    if (pressedButtons[bk]) {
        const rec = records.find(r => r.container_id === containerId && r.button_number === buttonNumber);
        if (rec) {
        const { error } = await supabase.from('records').delete().eq('id', rec.id);
        if (error) { console.error('기록 삭제 에러:', error); return; }
        setRecords(prev => prev.filter(r => r.id !== rec.id));
        }
        const newPB = { ...pressedButtons };
        delete newPB[bk];
        setPressedButtons(newPB);
        await saveSetting('pressedButtons', newPB);
        return;
    }

    const newRec = {
        id: Date.now(), name: containerName, amount,
        button_number: buttonNumber, container_id: containerId,
        type: 'regular', date: new Date().toISOString(),
    };
    const { error } = await supabase.from('records').insert(newRec);
    if (error) { console.error('기록 추가 에러:', error); return; }
    setRecords(prev => [newRec, ...prev]);
    const newPB = { ...pressedButtons, [bk]: true };
    setPressedButtons(newPB);
    await saveSetting('pressedButtons', newPB);

    if (buttonNumber === buttonCount) {
        setTimeout(async () => {
        setPressedButtons(prev => {
            const s = { ...prev };
            Object.keys(s).forEach(k => { if (k.startsWith(`${containerId}-`)) delete s[k]; });
            saveSetting('pressedButtons', s);
            return s;
        });
        }, 100);
    }
    };

    // ─── 기록 삭제 ─────────────────────────────────────────────────
    const deleteRecord = async (id) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) { console.error('기록 삭제 에러:', error); return; }
    setRecords(prev => prev.filter(r => r.id !== id));
    if (rec.type === 'other') return;

    const cid = rec.container_id;
    const maxNum = Object.keys(pressedButtons)
        .filter(k => k.startsWith(`${cid}-`))
        .map(k => parseInt(k.split('-')[1]))
        .sort((a, b) => b - a)[0];
    if (maxNum !== undefined) {
        const s = { ...pressedButtons };
        delete s[`${cid}-${maxNum}`];
        setPressedButtons(s);
        await saveSetting('pressedButtons', s);
    }
    };

    // ─── 기타 용돈 ─────────────────────────────────────────────────
    const addOtherAllowance = async () => {
    if (!otherData.amount || !otherData.source) return;
    const newRec = {
        id: Date.now(), name: otherData.source,
        amount: parseInt(otherData.amount),
        date: new Date().toISOString(), type: 'other',
    };
    const { error } = await supabase.from('records').insert(newRec);
    if (error) { console.error('기타용돈 추가 에러:', error); return; }
    setRecords(prev => [newRec, ...prev]);
    setOtherData({ amount: '', source: '' });
    setShowOtherForm(false);
    };

    // ─── 지급 완료 ─────────────────────────────────────────────────
    const handlePaymentComplete = async () => {
    const now = new Date().toISOString();
    setLastPaymentReset(now);
    setPaymentCompleted(true);
    setPressedButtons({});
    await Promise.all([
        saveSetting('lastPaymentReset', now),
        saveSetting('paymentCompleted', 'true'),
        saveSetting('pressedButtons', {}),
    ]);
    };

    // ─── 유틸 ──────────────────────────────────────────────────────
    const groupRecordsByDate = () => {
    const g = {};
    records.forEach(r => {
        if (!r.date) return;
        const d = new Date(r.date).toLocaleDateString('ko-KR');
        if (!g[d]) g[d] = [];
        g[d].push(r);
    });
    return g;
    };

    const getTotalAmount = () => {
    if (!lastPaymentReset) return records.reduce((s, r) => s + r.amount, 0);
    return records.filter(r => new Date(r.date) > new Date(lastPaymentReset)).reduce((s, r) => s + r.amount, 0);
    };

    const isPaydayActive = () => {
    if (paymentCompleted) return false;
    const today = new Date();
    return paydaySettings.type === 'monthly'
        ? today.getDate() === paydaySettings.day
        : today.getDay() === paydaySettings.day;
    };

    const getPaydayText = () => {
    if (paydaySettings.type === 'monthly') return `매월 ${paydaySettings.day}일`;
    return `매주 ${ ['일','월','화','수','목','금','토'][paydaySettings.day]}요일`;
    };

    const getAnalysisData = () => {
    if (analysisView === 'weekly') {
        const year = new Date().getFullYear();
        const firstDay = new Date(year, selectedMonth, 1);
        const lastDay = new Date(year, selectedMonth + 1, 0);
        const weeks = Math.ceil((lastDay.getDate() + firstDay.getDay()) / 7);
        const wd = {};
        for (let i = 1; i <= weeks; i++) wd[`${i}주차`] = 0;
        records.forEach(r => {
        const d = new Date(r.date);
        if (d.getFullYear() === year && d.getMonth() === selectedMonth) {
            const wn = Math.ceil((d.getDate() + firstDay.getDay()) / 7);
            wd[`${wn}주차`] += r.amount;
        }
        });
        return Object.entries(wd).map(([name, amount]) => ({ name, amount }));
    } else {
        const md = {};
        for (let i = 1; i <= 12; i++) md[`${i}월`] = 0;
        records.forEach(r => {
        const d = new Date(r.date);
        if (d.getFullYear() === selectedYear) md[`${d.getMonth()+1}월`] += r.amount;
        });
        return Object.entries(md).map(([name, amount]) => ({ name, amount }));
    }
    };

    const getAvailableYears = () => {
    const ys = new Set([new Date().getFullYear()]);
    records.forEach(r => ys.add(new Date(r.date).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
    };

    const getAvailableMonths = () => {
    const ms = new Set([new Date().getMonth()]);
    records.forEach(r => ms.add(new Date(r.date).getMonth()));
    return Array.from(ms).sort((a, b) => a - b);
    };

    const mn = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    if (!loaded) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 font-bold text-lg">불러오는 중...</p>
    </div>
    );

    // ─── UI ────────────────────────────────────────────────────────
    return (
    <div className="min-h-screen bg-gray-50 pb-20 font-bold">
        <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span style={{ color: '#22c55e', fontSize: '1.4em' }}>$</span> 용돈 트래커
        </h1>
        </div>

        {/* ── 용돈 페이지 ── */}
        {currentPage === 'allowance' && (
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 max-w-4xl mx-auto">
            {/* 총 금액 카드 */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-4 sm:p-6 text-white">
            <div className="flex justify-between items-start mb-3">
                <div>
                <p className="text-xs sm:text-sm opacity-90 mb-1">총 누적 용돈</p>
                <p className="text-3xl sm:text-5xl font-bold">{getTotalAmount().toLocaleString()}원</p>
                </div>
                <button onClick={() => setShowPaydaySettings(true)}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-2 transition">
                <Settings size={18} />
                </button>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm opacity-90 mb-3">
                <Calendar size={14} /><span>지급일: {getPaydayText()}</span>
            </div>
            <button onClick={handlePaymentComplete} disabled={!isPaydayActive()}
                className={`w-full py-2.5 sm:py-3 rounded-lg font-bold transition text-sm sm:text-base ${
                isPaydayActive() ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'}`}>
                지급 완료
            </button>
            </div>

            {/* 지급일 설정 모달 */}
            {showPaydaySettings && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base sm:text-lg font-bold">지급일 설정</h3>
                    <button onClick={() => setShowPaydaySettings(false)}><X size={20} /></button>
                </div>
                <div className="space-y-3">
                    <div>
                    <label className="block text-xs sm:text-sm font-bold mb-2">주기</label>
                    <select value={paydaySettings.type}
                        onChange={e => setPaydaySettings({ ...paydaySettings, type: e.target.value, day: 1 })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold">
                        <option value="monthly">매월</option>
                        <option value="weekly">매주</option>
                    </select>
                    </div>
                    <div>
                    <label className="block text-xs sm:text-sm font-bold mb-2">날짜</label>
                    {paydaySettings.type === 'monthly' ? (
                        <select value={paydaySettings.day}
                        onChange={e => setPaydaySettings({ ...paydaySettings, day: parseInt(e.target.value) })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d =>
                            <option key={d} value={d}>{d}일</option>)}
                        </select>
                    ) : (
                        <select value={paydaySettings.day}
                        onChange={e => setPaydaySettings({ ...paydaySettings, day: parseInt(e.target.value) })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold">
                        {['일요일','월요일','화요일','수요일','목요일','금요일','토요일'].map((d, i) =>
                            <option key={i} value={i}>{d}</option>)}
                        </select>
                    )}
                    </div>
                    <button onClick={() => { saveSetting('paydaySettings', paydaySettings); setShowPaydaySettings(false); }}
                    className="w-full bg-blue-500 text-white rounded-lg p-2.5 font-bold hover:bg-blue-600 transition text-sm">
                    완료
                    </button>
                </div>
                </div>
            </div>
            )}

            {/* 추가하기 버튼 */}
            <button onClick={() => setShowAddForm(true)}
            className="w-full bg-blue-500 text-white rounded-lg p-3 sm:p-4 flex items-center justify-center gap-2 hover:bg-blue-600 transition font-bold text-sm sm:text-base">
            <Plus size={20} /><span>추가하기</span>
            </button>

            {/* 추가 팝업 */}
            {showAddForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base sm:text-lg font-bold">새 항목 추가</h3>
                    <button onClick={() => setShowAddForm(false)}><X size={20} /></button>
                </div>
                <div className="space-y-3">
                    {[
                    { ph: '이름 (예: 설거지)', key: 'name', type: 'text' },
                    { ph: '1회당 금액', key: 'amount', type: 'number' },
                    { ph: '버튼 개수', key: 'buttonCount', type: 'number' },
                    ].map(({ ph, key, type }) => (
                    <input key={key} type={type} placeholder={ph} value={formData[key]}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-sm" />
                    ))}
                    <button onClick={addContainer}
                    className="w-full bg-green-500 text-white rounded-lg p-2.5 font-bold hover:bg-green-600 transition text-sm">
                    완료
                    </button>
                </div>
                </div>
            </div>
            )}

            {/* 컨테이너 목록 */}
            <div className="space-y-3 sm:space-y-4">
            {containers.map(c => (
                <div key={c.id} className="bg-white rounded-lg shadow p-4 sm:p-6 relative">
                <button onClick={() => deleteContainer(c.id)}
                    className="absolute top-3 right-3 text-red-500 hover:text-red-700">
                    <X size={18} />
                </button>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 pr-8">{c.name}</h2>
                <p className="text-xs sm:text-sm font-bold text-gray-600 mb-3">1회당 {c.amount.toLocaleString()}원</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Array.from({ length: c.buttonCount }, (_, i) => i + 1).map(num => {
                    const bk = `${c.id}-${num}`;
                    return (
                        <button key={num}
                        onClick={() => handleButtonClick(c.name, c.amount, num, c.id, c.buttonCount)}
                        className={`${pressedButtons[bk] ? 'bg-green-500 text-white' : 'bg-blue-100 text-blue-800'}
                            font-bold py-2.5 sm:py-3 px-3 rounded-lg transition-all duration-300 text-sm sm:text-base`}>
                        {num}
                        </button>
                    );
                    })}
                </div>
                </div>
            ))}
            </div>

            {/* 기타 용돈 */}
            <button onClick={() => setShowOtherForm(true)}
            className="w-full bg-purple-500 text-white rounded-lg p-3 sm:p-4 flex items-center justify-center gap-2 hover:bg-purple-600 transition font-bold text-sm sm:text-base">
            <Plus size={20} /><span>기타 용돈</span>
            </button>

            {showOtherForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base sm:text-lg font-bold">기타 용돈 추가</h3>
                    <button onClick={() => setShowOtherForm(false)}><X size={20} /></button>
                </div>
                <div className="space-y-3">
                    <input type="number" placeholder="금액" value={otherData.amount}
                    onChange={e => setOtherData({ ...otherData, amount: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-sm" />
                    <input type="text" placeholder="누가 줬는지 / 어디서 받았는지" value={otherData.source}
                    onChange={e => setOtherData({ ...otherData, source: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-sm" />
                    <button onClick={addOtherAllowance}
                    className="w-full bg-purple-500 text-white rounded-lg p-2.5 font-bold hover:bg-purple-600 transition text-sm">
                    완료
                    </button>
                </div>
                </div>
            </div>
            )}
        </div>
        )}

        {/* ── 기록 페이지 ── */}
        {currentPage === 'records' && (
        <div className="p-3 sm:p-4 max-w-4xl mx-auto">
            {Object.entries(groupRecordsByDate()).map(([date, dateRecords]) => (
            <div key={date} className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-700 mb-2">{date}</h3>
                <div className="space-y-2 mb-3">
                {dateRecords.map(r => (
                    <div key={r.id} className="bg-white rounded-lg shadow p-3 sm:p-4 flex justify-between items-center">
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm sm:text-base truncate">{r.name}</p>
                        <p className="text-blue-600 font-bold text-sm sm:text-base">{r.amount.toLocaleString()}원</p>
                        <p className="text-xs text-gray-500">
                        {new Date(r.date).toLocaleTimeString('ko-KR')}
                        {r.type === 'other' && <span className="ml-2 text-purple-600">(기타)</span>}
                        </p>
                    </div>
                    <button onClick={() => deleteRecord(r.id)}
                        className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0">
                        <Trash2 size={18} />
                    </button>
                    </div>
                ))}
                </div>
                <hr className="border-gray-300" />
            </div>
            ))}
            {records.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
                <p className="font-bold text-sm sm:text-base">아직 기록이 없습니다</p>
            </div>
            )}
        </div>
        )}

        {/* ── 분석 페이지 ── */}
        {currentPage === 'analysis' && (
        <div className="p-3 sm:p-4 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
            <div className="flex gap-2 mb-4">
                {['weekly','monthly'].map(v => (
                <button key={v} onClick={() => setAnalysisView(v)}
                    className={`flex-1 py-2.5 sm:py-3 px-3 rounded-xl font-bold transition text-sm sm:text-base ${
                    analysisView === v ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700'}`}>
                    {v === 'weekly' ? '주별' : '월별'}
                </button>
                ))}
            </div>
            {analysisView === 'weekly' && (
                <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-800 mb-3 text-center">
                    {new Date().getFullYear()}년 {mn[selectedMonth]}
                </h3>
                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-sm">
                    {getAvailableMonths().map(m => <option key={m} value={m}>{mn[m]}</option>)}
                </select>
                </div>
            )}
            {analysisView === 'monthly' && (
                <div className="mb-4">
                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-sm">
                    {getAvailableYears().map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                </div>
            )}
            {records.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                <BarChart data={getAnalysisData()}>
                    <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.6} />
                    </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80}
                    tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 'bold' }} />
                    <Tooltip contentStyle={{
                    backgroundColor: '#fff', border: 'none', borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px'
                    }} formatter={v => [`${v.toLocaleString()}원`, '금액']} />
                    <Bar dataKey="amount" fill="url(#colorAmount)" radius={[8,8,0,0]}
                    animationDuration={1000} animationBegin={0} />
                </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="text-center text-gray-500 py-16">
                <TrendingUp size={40} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold text-sm">분석할 데이터가 없습니다</p>
                </div>
            )}
            </div>
        </div>
        )}

        {/* ── 하단 네비게이션 ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t">
        <div className="flex max-w-4xl mx-auto">
            {[
            { page: 'allowance', icon: <DollarSign size={20} />, label: '용돈' },
            { page: 'records',   icon: <List size={20} />,       label: '기록' },
            { page: 'analysis',  icon: <TrendingUp size={20} />, label: '분석' },
            ].map(({ page, icon, label }) => (
            <button key={page} onClick={() => setCurrentPage(page)}
                className={`flex-1 py-3 sm:py-4 flex flex-col items-center ${
                currentPage === page ? 'text-blue-500' : 'text-gray-500'}`}>
                {icon}
                <span className="text-xs sm:text-sm mt-1 font-bold">{label}</span>
            </button>
            ))}
        </div>
        </div>
    </div>
    );
    }