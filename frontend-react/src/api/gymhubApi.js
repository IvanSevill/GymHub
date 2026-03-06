import axios from 'axios';

const API_URL = 'http://localhost:8000';

const getUserEmail = () => localStorage.getItem('gymhub_user_email');

export const fetchWorkouts = async () => {
    const email = getUserEmail();
    if (!email) return [];
    const response = await axios.get(`${API_URL}/workouts?user_email=${email}`);
    return response.data;
};

export const fetchUser = async () => {
    const email = getUserEmail();
    if (!email) throw new Error("No user email");
    const response = await axios.get(`${API_URL}/users/me?user_email=${email}`);
    return response.data;
};

export const syncWorkouts = async () => {
    const email = getUserEmail();
    if (!email) throw new Error("No user email");
    const response = await axios.post(`${API_URL}/sync/manual?user_email=${email}`);
    return response.data;
};

export const fetchCalendars = async () => {
    const email = getUserEmail();
    if (!email) throw new Error("No user email");
    const response = await axios.get(`${API_URL}/users/calendars?user_email=${email}`);
    return response.data;
};

export const updateSelectedCalendar = async (calendarId) => {
    const email = getUserEmail();
    if (!email) throw new Error("No user email");
    const response = await axios.patch(`${API_URL}/users/selected-calendar?user_email=${email}&calendar_id=${calendarId}`);
    return response.data;
};

export const connectGoogleWithCode = async (code) => {
    const response = await axios.post(`${API_URL}/auth/google/connect`, { code });
    if (response.data && response.data.user) {
        localStorage.setItem('gymhub_user_email', response.data.user.email);
    }
    return response.data;
};

export const fetchExercisesByMuscle = async () => {
    const email = getUserEmail();
    if (!email) throw new Error("No user email");
    const response = await axios.get(`${API_URL}/workouts/exercises-by-muscle?user_email=${email}`);
    return response.data; // { Pecho: [{name, last_weight}], ... }
};

export const createEventTemplate = async (payload) => {
    const response = await axios.post(`${API_URL}/calendar/create-template`, {
        user_email: getUserEmail(),
        ...payload
    });
    return response.data;
};

