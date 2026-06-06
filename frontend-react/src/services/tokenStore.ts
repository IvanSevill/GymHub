let _token: string | null = null;

export const getToken = () => _token;
export const setToken = (t: string | null) => {
  _token = t;
};
