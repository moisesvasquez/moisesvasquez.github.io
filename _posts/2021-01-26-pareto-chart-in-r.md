---
layout: post
title:  "Pareto Chart Using R and ggplot2"
date:   2021-01-26 20:07:25 -0400
image: https://www.teodesk.com/wp-content/uploads/2018/12/2.jpg
permalink: /blog/pareto-chart-in-r-using-ggplot
description: "Using R and ggplot2 to bluid a Pareto Chart."
category: Visualization
tags: blog-post
---

Have you ever wanted to build a custom pareto chart using ggplot2? Well in this guide I'll show you how to do just that.

You can jump straigt to the full code by clicking here:

[Full Code](#fullcode)

Or take it step by step in the guide

1. Pareto Principle
2. Using ggplot2
3. What about plotly?

GUIDE COMING SOON!

If you ended up in this guide you probably already know what the Pareto Principle or the 80-20 rule is. If not, in a nutshell, the 80-20 rule is a principle that says that 80% of outcomes (or outputs) result from 20% of all causes (or inputs) for any given event. You can read more about it here [Investopedia] https://www.investopedia.com/terms/1/80-20-rule.asp

In this guide, we are going to break down the process of calculating the 80-20 rule of your data and how to visualize it using R’s ggplot. For those of you, like me, that like to just copy and paste random code and figure out yourself what it means, you can jump straight to the full code here, and for the rest of you that want to learn step by step [Full Code](#fullcode), keep reading.

Calculating Pareto
We are going to be using this sample data, and yes it is inspired by the best Thanksgiving song of all time:
Code for Sample Data.
Notice that this data is already grouped by category with `total_sales` being the sum of all sales in each category. To calculate Pareto we need to:
Order the total sales in descending order.
Calculate the cumulative sales value.
Calculate each category’s percentage of the total sales.
Calculate the cumulative percentage of total sales. (The 80% comes from here)
Calculate what percentage of total categories each category represents.
And finally, calculate the cumulative percentage of the categories. (The 20% comes from here)
Code for 80-20 calculation.

Pareto Chart using ggplot

Let’s jump straight to the code and dissect it below:

{% highlight r %}
pare.data2 <-
  superstore %>% 
  select(Sales, Sub.Category) %>% 
  group_by(Sub.Category) %>% 
  summarize(Sales = sum(Sales)) %>% 
  arrange(desc(Sales)) %>%
  mutate(
    Cumulative_Sum_Sales = cumsum(Sales),
    Frequency = round(Sales / sum(Sales), 3),
    Cumulative_Frequency = cumsum(Frequency)
  )
pare.data2 <- pare.data2 %>% mutate(Percentace_Of_Sales = 1/nrow(pare.data2),Cumulative_Sales_Value =  cumsum(Percentace_Of_Sales)) %>% select(Sub.Category,Sales,Cumulative_Frequency,Cumulative_Sales_Value)
pare.data2
{% endhighlight %}


OK, but what does it all mean?

[Image describing plot components]
How to read a Pareto chart?

Let’s look at the code by section. The first section consists of creating some elements that we are going to use for the chart. 
`max100` is just the maximum value for total sales, this is used to calculate the secondary axis.
`curve` gives us each point of the pareto curve which is the cumulative percentage of total sales.
`line` is the horizontal line that shows where the 80% lands.
The rest are just regular ggplot components. Two things to notice are the `reorder()` function used in the `x` parameter that puts the bars in numerical order, and the `scale_y_continuous()` function that allows us to have two Y axis.

Put all the code together.
Full Code

Want to make it interactive?
Sure, you can pass the ggplot element to the ggplotly() function, and with the extra `text` aestetic you can have an interactive Pareto Chart like this:

[plotly element]

The only thing that does not transfer to plotly using this method is the secondary Y axis. 

Now, this is not the only method of creating Pareto Charts in R, I encourage you to keep exploring and finding new ways to visualize the data that matters to you. This particular chart can be improved in many ways, but for the purpose of this blog it shows a good visual representation of what the Pareto Principle or the 80-20 rule looks like with your data. 

