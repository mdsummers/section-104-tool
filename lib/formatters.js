const format = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    hour12: false,
  });

  // "Dec 21, 13:01" → remove the comma
  return formatter.format(date);
};

exports.formatDate = (d) => format(d)
  .replace(',', ' at');

exports.formatDateOnly = (d) => format(d)
  .replace(/,.*$/, '');
