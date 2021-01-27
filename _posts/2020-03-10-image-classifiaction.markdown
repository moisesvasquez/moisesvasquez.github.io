---
layout: post
title:  "Image Classification"
date:   2020-03-11 20:07:25 -0400
image: https://i.pinimg.com/originals/25/7c/c1/257cc149de4ea6c0d3cd6cb03218affd.jpg
permalink: /projects/image-classification
description: "Building an image classification algorithm API with R."
category: Image Processing, Classification Models
duration: 8 Weeks
tools: Descition Trees, Naive Bayes Model, Image Manipulation
language: R Language
brief: "To succesfully use this project, you need a large compilation of images that are separated in at least 2 folders, each folder representing a class to be classified. The images need to be stored on a local directory. For this project we have two folders stored locally one with pictures of cars , obtained from Kaggle, and another file of pictures that are not cars, obtained from the Visual Genome."
github: "https://github.com/moisesvasquez/Image-Classification"
dashboard:
tags: project
---
<div class="case-header">
  <div class="media-wrapper">
    <div class="case-header-image" style="background: linear-gradient(rgba(97,97,97,.6), rgba(97,97,97,.6)), url({{page.image}}) center center no-repeat;background-size: cover;"></div>
    <div class="image-overlay"></div>
  </div>
    <div class="case-title">
      <div class="row">
          <div class="large-8 columns">
            <h2>{{ page.title }} </h2>
            <p>{{ page.description }}</p>
          </div>
      </div>
    </div>
  <p class="action-hint">
    <span class="scroll-down">
      Scroll down for project details.
      <i class="icon-arrows-slim-down"></i>
    </span>
  </p>
</div>
<div class="case-study-content">
    <div class="full">
        <div class="large-6 columns">
          <div class="row">
            <div class="large-5 columns">
              <div class="spacing"></div>
              <h3 class="meta-title">Category</h3>
              <p class="meta-data">{{ page.category }}</p>
            </div>
            <div class="large-7 columns">
              <div class="spacing"></div>
              <h3 class="meta-title">Project Timeline</h3>
              <p class="meta-data">{{ page.duration }}</p>
            </div>
          </div>
          <div class="spacing"></div>
          <div class="row">
            <div class="large-5 columns">
              <h3 class="meta-title">Tools</h3>
              <p class="meta-data">{{ page.tools }}</p>
            </div>
            <div class="large-7 columns">
              <h3 class="meta-title">Programming Language</h3>
              <p class="meta-data">{{ page.language }}</p>
            </div>
          </div>
          <div class="four spacing"></div>
        </div>
        <div class="large-6 columns">
          <h2 class="colored-title">The brief</h2>
          <p class="big-text">{{ page.brief }}</p>
          <div class="spacing"></div>
          {% if page.dashboard %}
          <p>
            <a href="{{ page.dashboard }}" target="_blank" class="boxed button black launch">Launch Interactive Dashboard <i class="icon-arrows-slim-right"></i> </a>
          </p>
          {% endif %}
        </div>
    </div>
    <div class="full light-grey">
        <div class="large-6 columns">
          <h2>The challenge</h2>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Excepturi minima dolorum laboriosam voluptas esse, repellat repudiandae ratione sed adipisci ab nemo explicabo magni, accusantium, inventore quia. Doloremque nihil, deserunt perspiciatis.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Velit, voluptatibus nobis consequuntur dolor doloribus accusantium dolorum nisi aliquam porro sed rerum odit qui id iure eaque nemo alias beatae. Nemo.</p>
          <div class="four spacing"></div>
          <h2>The solution</h2>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Excepturi minima dolorum laboriosam voluptas esse, repellat repudiandae ratione sed adipisci ab nemo explicabo magni, accusantium, inventore quia. Doloremque nihil, deserunt perspiciatis.
          Lorem ipsum dolor sit amet, consectetur adipisicing elit. Velit, voluptatibus nobis consequuntur dolor doloribus accusantium dolorum nisi aliquam porro sed rerum odit qui id iure eaque nemo alias beatae. Nemo.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Excepturi minima dolorum laboriosam voluptas esse, repellat repudiandae ratione sed adipisci ab nemo explicabo magni, accusantium, inventore quia. Doloremque nihil, deserunt perspiciatis.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Velit, voluptatibus nobis consequuntur dolor doloribus accusantium dolorum nisi aliquam porro sed rerum odit qui id iure eaque nemo alias beatae. Nemo.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Excepturi minima dolorum laboriosam voluptas esse, repellat repudiandae ratione sed adipisci ab nemo explicabo magni, accusantium, inventore quia. Doloremque nihil, deserunt perspiciatis.
          Lorem ipsum dolor sit amet, consectetur adipisicing elit. Velit, voluptatibus nobis consequuntur dolor doloribus accusantium dolorum nisi aliquam porro sed rerum odit qui id iure eaque nemo alias beatae. Nemo.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Excepturi minima dolorum laboriosam voluptas esse, repellat repudiandae ratione sed adipisci ab nemo explicabo magni, accusantium, inventore quia. Doloremque nihil, deserunt perspiciatis.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Velit, voluptatibus nobis consequuntur dolor doloribus accusantium dolorum nisi aliquam porro sed rerum odit qui id iure eaque nemo alias beatae. Nemo.</p>
                    <div class="spacing"></div>
          {% if page.github %}
          <p>
            <a href="{{ page.github }}" class="boxed button black launch"><i class='fa fa-github'></i> View on GitHub</a>
          </p>
          {% endif %}
        </div>
        <div class="large-6 columns">
          <img src="../assets/images/@stock/iphones.png" alt="">
        </div>
    </div>
    <div class="full">
      <div class="large-12 columns">
        <h2>The results</h2>
        <p class="big-text">Lorem ipsum dolor sit amet, consectetur adipisicing elit. Quo temporibus placeat omnis laudantium necessitatibus possimus accusantium? Doloribus, dolore explicabo iusto beatae, minus ad mollitia quam velit.</p>
      </div>
    </div>
    <div class="full colored-bg red">
      <p class="centered-text">
        <img src="../assets/images/@stock/result-1.png" alt="">
      </p>
    </div>
    <div class="full">
      <p class="big-text">Lorem ipsum dolor sit amet, consectetur adipisicing elit. Incidunt quo, temporibus voluptas autem cum natus eos. Libero corporis optio ratione molestias eligendi! In, expedita voluptatibus consectetur porro quam maiores tempora. Lorem ipsum dolor sit amet, consectetur adipisicing elit. Atque eius totam distinctio eos rerum, praesentium itaque ipsum asperiores iste veniam blanditiis sed laborum, ducimus placeat sint sunt earum? Impedit, beatae!
      </p>
    </div>
    <div class="full colored-bg purple">
      <p class="centered-text">
        <img src="../assets/images/@stock/result-2.png" alt="">
      </p>
    </div>
    <!--PAGINATION-->
    <div class="case-nav">
      <div class="large-6 columns">
          <div class="item small-nav previous">
          {% if page.previous.url %}
            <a href="{{page.previous.url}}">
              <div class="circle-wrap">
                <div class="media work-1"></div>
              </div>
              <span class="nav-title">
                <span class="sub-title">
                    Previous Project
                </span>
                <span class="title">
                    {{page.previous.title}}
                </span>
              </span>
            </a>
            {% else %}
            <a href="/projects">
              <div class="circle-wrap">
                <div class="media work-2"></div>
              </div>
              <span class="nav-title">
                <span class="sub-title">
                    View All Projects
                </span>
              </span>
            </a>
            {% endif %}
          </div>
      </div>
      <div class="large-6 columns">
          <div class="item small-nav next">
          {% if page.next.url %}
            <a href="{{page.next.url}}">
              <div class="circle-wrap">
                <div class="media work-2"></div>
              </div>
              <span class="nav-title">
                <span class="sub-title">
                    Next Project
                </span>
                <span class="title">
                    {{page.next.title}}
                </span>
              </span>
            </a>
            {% else %}
            <a href="/projects">
              <div class="circle-wrap">
                <div class="media work-2"></div>
              </div>
              <span class="nav-title">
                <span class="sub-title">
                    View All Projects
                </span>
              </span>
            </a>
            {% endif %}
          </div>
      </div>
    </div>
</div>
<script src="../bower_components/js/jquery/dist/jquery.js"></script>
<script src="../bower_components/js/foundation-sites/dist/assets/js/foundation.js"></script>
<script src="../bower_components/js/countto/jquery.countTo.js"></script>
<script src="../assets/js/jquery.appear.js"></script>
<script src="../assets/js/slick.min.js" type="text/javascript"></script>
<script src="../assets/js/app.js"></script>
</body>
</html>