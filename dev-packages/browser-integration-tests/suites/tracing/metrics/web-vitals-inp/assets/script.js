const delay = (delay = 70) => e => {
  const startTime = Date.now();

  function getElasped() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElasped() < delay) {
    //
  }

  e.target.classList.add('clicked');
};

document.querySelector('[data-test-id=slow-interaction-button]').addEventListener('click', delay(200));
document.querySelector('[data-test-id=interaction-button]').addEventListener('click', delay());
document.querySelector('[data-test-id=annotated-button]').addEventListener('click', delay());
document.querySelector('[data-test-id=styled-button]').addEventListener('click', delay());

document.querySelector('[data-test-id=click-me-button]').addEventListener('click', function (e) {
  this.textContent = 'Clicked!';
  requestAnimationFrame(() => {
    e.target.classList.add('clicked');
    requestAnimationFrame(() => {
      this.textContent = 'Click me';
    });
  });
});
