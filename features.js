'use strict';
/* Features that are set aside for now and can be switched back on later (their data files are not shipped while off). */
window.FEATURES = { reminders: false, today: true, prayer: true,
  // 3.17: the app keeps to the Scripture itself. The Commentary tab only opens the verse at Blue Letter Bible, online,
  // for anyone who wants to read commentaries there.
  commentary: false,
  // 3.17.1: About this book shows C. I. Scofield's introduction to the book (1917, public domain), word for word
  scofield: true };
window.ABOUT_ON = FEATURES.scofield;
