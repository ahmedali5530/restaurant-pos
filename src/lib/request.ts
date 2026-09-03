interface RequestOptions extends RequestInit{
  withAuthHeaders?: boolean
}
export const jsonRequest = async (url: RequestInfo, options?: RequestOptions) => {
  const headers = {
    accept: 'application/json',
  };

  Object.assign(headers, options.headers)

  options.headers = headers;

  return await fetch(url, options);
}
