import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8002';

function App() {
  const [view, setView] = useState('home');
  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [respondentName, setRespondentName] = useState('');
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState([]);
  const [insightMetrics, setInsightMetrics] = useState([]);
  const [chartData, setChartData] = useState({ q1: [], q4: [], q10: [] });

  useEffect(() => {
    axios.get(`${API_BASE}/form`).then((res) => {
      setSurvey(res.data.survey);
      setQuestions(res.data.questions || []);
    });
  }, []);

  const questionMap = useMemo(() => {
    return questions.reduce((map, question) => {
      map[question.id] = question;
      return map;
    }, {});
  }, [questions]);

  const optionLabelMap = useMemo(() => {
    return questions.reduce((map, question) => {
      map[question.id] = (question.options || []).reduce((opts, option) => {
        opts[option.value] = option.label;
        return opts;
      }, {});
      return map;
    }, {});
  }, [questions]);

  const getOptionLabel = (questionId, value) => {
    return optionLabelMap[questionId]?.[value] || value;
  };

  const getQuestionText = (questionId) => {
    return questionMap[questionId]?.text || questionId;
  };

  const renderAnswerValue = (answer) => {
    const selectedOptions = answer.selectedOptions || [];
    const selectedLabels = Array.isArray(selectedOptions)
      ? selectedOptions.map((value) => getOptionLabel(answer.questionId, value)).filter(Boolean)
      : [];
    const typed = answer.typedAnswer?.trim();

    if (selectedLabels.length && typed) {
      return `${selectedLabels.join(', ')} (${typed})`;
    }
    if (selectedLabels.length) {
      return selectedLabels.join(', ');
    }
    return typed || 'No answer';
  };

  const visibleQuestions = useMemo(() => {
    if (!questions.length) return [];
    const answeredMap = answers;
    const visible = [];
    for (const question of questions) {
      const cond = question.displayCondition;
      if (!cond) {
        visible.push(question);
        continue;
      }
      const parent = answeredMap[cond.questionId];
      const selectedValue = parent?.selectedValue;
      if (cond.optionValue) {
        if (selectedValue === cond.optionValue) visible.push(question);
      } else if (cond.optionValues) {
        if (cond.optionValues.includes(selectedValue)) visible.push(question);
      }
    }
    return visible;
  }, [answers, questions]);

  const handleOptionChange = (question, optionValue, checked = false) => {
    setAnswers((prev) => {
      const current = prev[question.id] || { selectedValue: null, selectedValues: [], typedAnswer: '' };
      if (question.type === 'single_select' || question.type === 'single_choice') {
        return { ...prev, [question.id]: { ...current, selectedValue: optionValue, selectedValues: [], typedAnswer: current.typedAnswer } };
      }
      const selectedValues = new Set(current.selectedValues || []);
      if (checked) selectedValues.add(optionValue);
      else selectedValues.delete(optionValue);
      return { ...prev, [question.id]: { ...current, selectedValues: Array.from(selectedValues), selectedValue: null, typedAnswer: current.typedAnswer } };
    });
  };

  const handleTextChange = (question, value) => {
    setAnswers((prev) => ({ ...prev, [question.id]: { ...(prev[question.id] || {}), typedAnswer: value } }));
  };

  const validate = () => {
    const nextErrors = {};
    visibleQuestions.forEach((question) => {
      if (!question.required) return;
      const answer = answers[question.id];
      if (question.type === 'single_select' || question.type === 'single_choice') {
        if (!answer?.selectedValue) nextErrors[question.id] = 'Please select an option.';
      } else if (question.type === 'multi_select' || question.type === 'multiple_choice') {
        if (!answer?.selectedValues?.length && !answer?.typedAnswer) nextErrors[question.id] = 'Please select or type an answer.';
      } else if (question.type === 'free_text' || question.type === 'text') {
        if (!answer?.typedAnswer?.trim()) nextErrors[question.id] = 'Please enter a value.';
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      respondentName: respondentName || 'Anonymous',
      answers: visibleQuestions.map((question) => ({
        question,
        selectedOptions: (question.type === 'single_select' || question.type === 'single_choice')
          ? [answers[question.id]?.selectedValue].filter(Boolean)
          : answers[question.id]?.selectedValues || [],
        typedAnswer: answers[question.id]?.typedAnswer || ''
      }))
    };
    try {
      await axios.post(`${API_BASE}/responses`, payload);
      setSubmitted(true);
      setErrors({});
    } catch (error) {
      alert('Submission failed.');
    }
  };

  const loadAdminResponses = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/responses`);
      const responseData = res.data;
      setResponses(responseData);

      const grouped = {};
      let activeCount = 0;
      let notConsideringCount = 0;
      const q1DomainCounts = {};
      const q10TimelineCounts = {};
      const q4StatusCounts = {};

      responseData.forEach((response) => {
        response.answers?.forEach((answer) => {
          const labelValue = renderAnswerValue(answer);
          if (!grouped[answer.questionId]) {
            grouped[answer.questionId] = {
              questionText: getQuestionText(answer.questionId),
              counts: {},
            };
          }
          grouped[answer.questionId].counts[labelValue] = (grouped[answer.questionId].counts[labelValue] || 0) + 1;

          if (!grouped[answer.questionId]) {
            grouped[answer.questionId] = {
              questionText: getQuestionText(answer.questionId),
              counts: {},
            };
          }
          grouped[answer.questionId].counts[labelValue] = (grouped[answer.questionId].counts[labelValue] || 0) + 1;

          if (answer.questionId === 'Q4') {
            q4StatusCounts[labelValue] = (q4StatusCounts[labelValue] || 0) + 1;
            if (labelValue === getOptionLabel('Q4', 'yes_actively_evaluating')) activeCount += 1;
            else notConsideringCount += 1;
          }
          if (answer.questionId === 'Q1') {
            q1DomainCounts[labelValue] = (q1DomainCounts[labelValue] || 0) + 1;
          }
          if (answer.questionId === 'Q10') {
            q10TimelineCounts[labelValue] = (q10TimelineCounts[labelValue] || 0) + 1;
          }
        });
      });

      const totalResponses = responseData.length;
      const topDomain = Object.entries(q1DomainCounts).sort((a, b) => b[1] - a[1])[0];
      const topTimeline = Object.entries(q10TimelineCounts).sort((a, b) => b[1] - a[1])[0];
      const q4Data = Object.entries(q4StatusCounts).map(([name, value]) => ({ name, value }));
      const q1Data = Object.entries(q1DomainCounts).map(([name, value]) => ({ name, value }));
      const q10Data = Object.entries(q10TimelineCounts).map(([name, value]) => ({ name, value }));

      setSummary(
        Object.entries(grouped).map(([questionId, entry]) => ({
          questionId,
          questionText: entry.questionText,
          counts: Object.entries(entry.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => ({ label, count })),
        }))
      );

      setInsightMetrics([
        { label: 'Total survey responses', value: totalResponses },
        { label: 'Actively evaluating India', value: `${activeCount} of ${totalResponses}` },
        { label: 'Considering later / not sure', value: `${notConsideringCount} of ${totalResponses}` },
        { label: 'Top primary domain', value: topDomain ? `${topDomain[0]}` : 'N/A' },
        { label: 'Top follow-up preference', value: topTimeline ? `${topTimeline[0]}` : 'N/A' },
      ]);
      setChartData({ q1: q1Data, q4: q4Data, q10: q10Data });
    } catch (error) {
      setResponses([]);
      setSummary([]);
      setInsightMetrics([]);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/admin/login`, adminCredentials);
      setAdminLoggedIn(true);
      setLoginError('');
      loadAdminResponses();
    } catch {
      setLoginError('Invalid credentials');
    }
  };

  const handleExport = async () => {
    const response = await axios.get(`${API_BASE}/admin/export`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'survey_responses.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Survey Portal</h1>
        <p>The adaptive survey assesses AI and ISV companies' readiness for expansion into India by evaluating market interest, motivations, challenges, awareness, expansion plans, timelines, and follow-up interest to identify potential business opportunities.</p>
      </header>

      {view === 'home' && (
        <div className="card actions">
          <button onClick={() => setView('survey')}>Fill Survey</button>
          <button onClick={() => setView('admin-login')}>Admin Login</button>
        </div>
      )}

      {view === 'survey' && !submitted && (
        <div className="card">
          <h2>{survey?.title || 'Survey'}</h2>
          <p>{survey?.description}</p>
          <form onSubmit={handleSubmit}>
            <input
              className="name-input"
              placeholder="Your name"
              value={respondentName}
              onChange={(e) => setRespondentName(e.target.value)}
            />
            {visibleQuestions.map((question) => {
              const answer = answers[question.id] || {};
              return (
                <div key={question.id} className="question-card">
                  <h3>{question.text}</h3>
                  {(question.type === 'single_select' || question.type === 'single_choice') && (
                    <div className="options-list">
                      {question.options?.map((option) => {
                        const showFreeText = (option.allowFreeText || option.allowCustomInput || question.allowCustomInput) && answer.selectedValue === option.value;
                        return (
                          <div key={option.value}>
                            <label className="option-item">
                              <input
                                type="radio"
                                name={question.id}
                                checked={answer.selectedValue === option.value}
                                onChange={() => handleOptionChange(question, option.value)}
                              />
                              <span>{option.label}</span>
                            </label>
                            {showFreeText && (
                              <input
                                className="name-input"
                                style={{ marginTop: '8px', marginBottom: '0' }}
                                placeholder={option.freeTextPlaceholder || question.customInputPlaceholder || 'Please specify'}
                                value={answer.typedAnswer || ''}
                                onChange={(e) => handleTextChange(question, e.target.value)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(question.type === 'multi_select' || question.type === 'multiple_choice') && (
                    <>
                      <p className="hint">You can choose more than one option.</p>
                      <div className="options-list">
                        {question.options?.map((option) => (
                          <label key={option.value} className="option-item">
                            <input
                              type="checkbox"
                              checked={(answer.selectedValues || []).includes(option.value)}
                              onChange={(e) => handleOptionChange(question, option.value, e.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {(question.type === 'free_text' || question.type === 'text') && (
                    <input
                      type="text"
                      className="name-input"
                      placeholder={question.inputPlaceholder || 'Type your answer'}
                      value={answer.typedAnswer || ''}
                      onChange={(e) => handleTextChange(question, e.target.value)}
                    />
                  )}
                  {errors[question.id] && <p className="error">{errors[question.id]}</p>}
                </div>
              );
            })}
            <button type="submit">Submit</button>
          </form>
        </div>
      )}

      {view === 'survey' && submitted && (
        <div className="card success">
          <h2>Thank you!</h2>
          <p>Your response has been submitted successfully.</p>
          <button onClick={() => setView('home')}>Back to Home</button>
        </div>
      )}

      {view === 'admin-login' && !adminLoggedIn && (
        <div className="card">
          <h2>Admin Login</h2>
          <form onSubmit={handleAdminLogin}>
            <input
              className="name-input"
              placeholder="Username"
              value={adminCredentials.username}
              onChange={(e) => setAdminCredentials({ ...adminCredentials, username: e.target.value })}
            />
            <input
              className="name-input"
              type="password"
              placeholder="Password"
              value={adminCredentials.password}
              onChange={(e) => setAdminCredentials({ ...adminCredentials, password: e.target.value })}
            />
            {loginError && <p className="error">{loginError}</p>}
            <button type="submit">Login</button>
          </form>
        </div>
      )}

      {view === 'admin-login' && adminLoggedIn && (
        <div className="card admin-card">
          <h2>Admin Dashboard</h2>
          <p className="admin-subtitle">Live survey analytics for the India expansion readiness questionnaire.</p>
          <div className="admin-actions">
            <div className="stat-pill">Total Responses: {responses.length}</div>
            <button onClick={handleExport}>Download Responses</button>
            <button onClick={() => { setAdminLoggedIn(false); setView('home'); }}>Logout</button>
          </div>
          <div className="insights-grid">
            {insightMetrics.map((metric) => (
              <div key={metric.label} className="insight-card">
                <div className="insight-title">{metric.label}</div>
                <div className="insight-value">{metric.value}</div>
              </div>
            ))}
          </div>
          <div className="charts-grid">
            <div className="chart-card">
              <h4>Primary Domain Distribution</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData.q1} margin={{ top: 12, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h4>Expansion Status</h4>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={chartData.q4} dataKey="value" nameKey="name" outerRadius={90} label>
                    {chartData.q4.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#7c3aed'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card full-width">
              <h4>Follow-up Interest</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData.q10} margin={{ top: 12, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="summary-card">
            <h3>Question Answer Trends</h3>
            {summary.map((item) => {
              const maxCount = Math.max(...item.counts.map((entry) => entry.count), 1);
              return (
                <div key={item.questionId} className="summary-item">
                  <div className="summary-title">{item.questionText}</div>
                  {item.counts.map((entry) => (
                    <div key={entry.label} className="bar-row">
                      <span className="bar-label">{entry.label}</span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${(entry.count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="bar-count">{entry.count}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="responses-list">
            <h3 className="section-heading">Submitted Responses</h3>
            {responses.map((response) => (
              <div key={response.id} className="response-card">
                <div className="response-card-header">
                  <strong>{response.respondentName}</strong>
                  <span>{new Date(response.submittedAt).toLocaleString()}</span>
                </div>
                <ul>
                  {response.answers?.map((answer) => (
                    <li key={answer.questionId}>
                      <strong>{getQuestionText(answer.questionId)}</strong>: {renderAnswerValue(answer)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="charts-panel">
            <h3>Response Charts</h3>
            <div className="charts-grid">
              <div className="chart-card">
                <h4>Primary Domain</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.q1} margin={{ top: 12, right: 12, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-card">
                <h4>Expansion Status</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={chartData.q4} dataKey="value" nameKey="name" outerRadius={90} label>
                      {chartData.q4.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#7c3aed'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-card full-width">
                <h4>Follow-up Interest</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.q10} margin={{ top: 12, right: 12, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#22c55e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="insights-panel">
            <h3>Additional Insights</h3>
            <div className="insight-text">
              <p>View trends across both active expansion and not-yet-planned respondents. The charts above show answer share for key survey questions, the cards summarize major signals, and the list above reveals full respondent detail.</p>
              <p>Use this dashboard to identify top motivations, concerns, and follow-up interest in India expansion.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
