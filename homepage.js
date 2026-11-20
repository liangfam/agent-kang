const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});
const isoCalendar = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' });

function updateClock() {
  const now = new Date();
  clockTime.textContent = timeFormat.format(now);
  clockTime.dateTime = clockTime.textContent;
  clockDate.textContent = dateFormat.format(now);
  clockDate.dateTime = isoCalendar.format(now);
}

updateClock();
setInterval(updateClock, 1000);

const contacts = {
  wechat: { name: '微信', account: '' },
  qq: { name: 'QQ', account: '' },
  alipay: { name: '支付宝', account: '' },
  douyin: { name: '抖音', account: '' },
};
const contactDialog = document.getElementById('contact-dialog');

for (const button of document.querySelectorAll('[data-contact]')) {
  button.addEventListener('click', () => {
    const contact = contacts[button.dataset.contact];
    document.getElementById('contact-name').textContent = contact.name;
    document.getElementById('contact-value').textContent = contact.account || contact.name + '账号待填写。';
    contactDialog.showModal();
  });
}
